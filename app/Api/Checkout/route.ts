import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {allowAttempt,clientKey,validCsrf,validUserSession} from "@/Lib/SECURITY";
import {auditFailure} from "@/Lib/AUDIT";
import {audit} from "@/Lib/AUDIT";
import {readProducts} from "@/Lib/ADMIN_STORE";
import {findValidCoupon} from "@/Lib/COUPONS";
import {findUserById} from "@/Lib/AUTH";
import {associateTransaction,createOrder,findOrderByIdempotencyKey,hashIdempotencyKey,markReconciliationRequired,updateOrder} from "@/Lib/ORDERS";
import {aggregateCartItems} from "@/Lib/CART";
import {createPromisseTransaction,parsePromisseTransaction} from "@/Lib/PROMISSE";
import {toPublicOrder} from "@/Lib/ORDER_VIEWS";
import {parseJsonBody} from "@/Lib/BODY_LIMITS";

const schema=z.object({
  items:z.array(z.object({productId:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),quantity:z.number().int().min(1).max(1000)})).min(1).max(100),
  couponCode:z.string().trim().max(40).optional().or(z.literal(""))
});
export const runtime="nodejs";
export const maxDuration=30;
const maxBody=16_384;
const PROMISSE_BASE=()=>process.env.PROMISSE_API_BASE_URL?.trim().replace(/\/$/,"")||"";
const PROMISSE_KEY=()=>process.env.PROMISSE_API_KEY?.trim()||"";
function safeUpstreamError(status:number,data:unknown){
  const code=typeof data==="object"&&data&&"code" in data?String((data as {code?:unknown}).code||""):"";
  return code?{error:"payment_provider_error",code,status}:{error:"payment_provider_error",status};
}
async function safeAudit(event:string,request:Request,details:Record<string,string|number|boolean>){
  try{await audit(event,request,details);}catch{await auditFailure(event,request,details);}
}
function checkoutResponse(order:Awaited<ReturnType<typeof createOrder>>,quote:{subtotal:number;discount:number;total:number;couponId?:string}){
  if(!order)throw new Error("order_not_found");
  return {ok:true,order:toPublicOrder(order),quote};
}

export async function POST(request:NextRequest){
  const key=clientKey(request);
  if(!await allowAttempt("checkout:"+key,5000))return NextResponse.json({error:"rate_limited"},{status:429});
  const csrf=request.headers.get("x-csrf-token")||"";const stored=request.cookies.get("shiny_csrf")?.value||"";
  if(!csrf||csrf!==stored||!await validCsrf(csrf))return NextResponse.json({error:"invalid_csrf"},{status:403});
  const sessionId=request.cookies.get("shiny_user_session")?.value||"";const userId=await validUserSession(sessionId);
  if(!userId)return NextResponse.json({error:"authentication_required"},{status:401});
  const user=await findUserById(userId);if(!user)return NextResponse.json({error:"authentication_required"},{status:401});
  const idempotencyKey=request.headers.get("idempotency-key")?.trim()||"";
  if(!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))return NextResponse.json({error:"idempotency_key_required"},{status:400});
  const body=await parseJsonBody(request,maxBody);if(!body.ok)return NextResponse.json({error:body.reason==="too_large"?"payload_too_large":"invalid_cart"},{status:body.reason==="too_large"?413:400});const parsed=schema.safeParse(body.data);if(!parsed.success)return NextResponse.json({error:"invalid_cart"},{status:400});

  const existing=await findOrderByIdempotencyKey(idempotencyKey);
  if(existing){
    if(existing.userId!==userId)return NextResponse.json({error:"idempotency_conflict"},{status:409});
    if(existing.status==="PENDING"&&!existing.transactionId)return NextResponse.json({error:"payment_creation_uncertain",orderId:existing.id},{status:503});
    return NextResponse.json(checkoutResponse(existing,{subtotal:existing.subtotal,discount:existing.discount,total:existing.total,couponId:existing.couponId}));
  }

  const products=await readProducts();const byId=new Map(products.map(product=>[product.id,product]));
  const aggregated=aggregateCartItems(parsed.data.items);
  if(!aggregated)return NextResponse.json({error:"invalid_cart"},{status:400});
  const items:{productId:string;name:string;quantity:number;unitPrice:number}[]=[];
  let subtotal=0;let category:string|undefined;
  for(const {productId,quantity} of aggregated){
    const product=byId.get(productId);
    if(!product||product.active===false)return NextResponse.json({error:"product_unavailable",productId},{status:409});
    if(typeof product.price!=="number"||!Number.isFinite(product.price)||product.price<0)return NextResponse.json({error:"product_price_unavailable"},{status:503});
    subtotal+=product.price*quantity;
    if(!category)category=product.category;
    items.push({productId:product.id,name:product.name,quantity,unitPrice:product.price});
  }

  let discount=0;let couponId:string|undefined;
  if(parsed.data.couponCode){
    const result=await findValidCoupon(parsed.data.couponCode,userId,items.map(item=>item.productId),category,subtotal);
    if(!result.coupon)return NextResponse.json({error:"invalid_coupon",reason:result.error},{status:422});
    discount=result.discount||0;couponId=result.coupon.id;
  }
  const total=Math.max(0,subtotal-discount);const amount=Math.round(total*100);
  if(!Number.isSafeInteger(amount)||amount<50)return NextResponse.json({error:"payment_amount_below_minimum"},{status:422});

  const base=PROMISSE_BASE();const apiKey=PROMISSE_KEY();const webhookUrl=process.env.PROMISSE_WEBHOOK_URL?.trim()||"";const webhookSecret=process.env.PROMISSE_WEBHOOK_SECRET?.trim()||"";
  if(!base||!apiKey)return NextResponse.json({error:"payment_not_configured",quote:{subtotal,discount,total,couponId}},{status:503});
  if(!webhookUrl||!webhookSecret)return NextResponse.json({error:"payment_webhook_not_configured",quote:{subtotal,discount,total,couponId}},{status:503});

  const order=await createOrder({userId,items,subtotal,discount,total,couponId,status:"PENDING",idempotencyKeyHash:hashIdempotencyKey(idempotencyKey)});
  if(!order)return NextResponse.json({error:"checkout_conflict"},{status:409});

  try{
    const {response,data}=await createPromisseTransaction(base,apiKey,amount,webhookUrl);
    if(!response.ok){
      await import("@/Lib/ORDERS").then(({updateOrder})=>updateOrder(order.id,{status:"FAILED",failureCode:typeof data==="object"&&data&&"code" in data?String((data as {code?:unknown}).code||"provider_error"):"provider_error"}));
      await safeAudit("checkout_payment_failed",request,{actor:userId,resource:order.id,result:String(response.status)});
      return NextResponse.json(safeUpstreamError(response.status,data),{status:response.status>=400&&response.status<500?response.status:502});
    }

    let provider;
    try{provider=parsePromisseTransaction(response.status,data,amount);}
    catch(error){
      const raw=typeof data==="object"&&data?data as Record<string,unknown>:null;
      const transactionId=typeof raw?.id==="string"?raw.id:"";
      if(response.status===201&&transactionId){
        await updateOrder(order.id,{transactionId,copyPaste:typeof raw?.copyPaste==="string"?raw.copyPaste:undefined,qrCodeBase64:typeof raw?.qrCodeBase64==="string"?raw.qrCodeBase64:undefined,expiresAt:typeof raw?.expiresAt==="string"?raw.expiresAt:undefined,status:"PENDING",providerStatus:"pending",failureCode:error instanceof Error?error.message:"provider_response_invalid"});
        await safeAudit("checkout_payment_failed",request,{actor:userId,resource:order.id,result:error instanceof Error?error.message:"provider_response_invalid"});
        return NextResponse.json({error:error instanceof Error&&error.message==="provider_amount_mismatch"?"payment_amount_mismatch":"payment_provider_response_invalid",orderId:order.id},{status:502});
      }
      throw error;
    }
    const associated=await associateTransaction(order.id,provider);
    const finalOrder=associated.order;
    if(!finalOrder)throw new Error("order_association_failed");
    await safeAudit("checkout_payment_created",request,{actor:userId,resource:order.id,result:associated.pendingApplied?"created_and_reconciled":"success"});
    return NextResponse.json(checkoutResponse(finalOrder,{subtotal,discount,total,couponId}));
  }catch{
    await markReconciliationRequired(order.id,"checkout_external_or_persistence_uncertain").catch(()=>{});
    await safeAudit("checkout_payment_failed",request,{actor:userId,resource:order.id,result:"upstream_or_persistence_error"});
    return NextResponse.json({error:"payment_creation_uncertain",orderId:order.id},{status:503});
  }
}
