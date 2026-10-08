import {NextRequest,NextResponse} from "next/server";
import {allowAttempt,clientKey,validCsrf,validUserSession} from "@/Lib/SECURITY";
import {findUserById} from "@/Lib/AUTH";
import {findOrderById} from "@/Lib/ORDERS";
import {reconcilePendingOrder} from "@/Lib/RECONCILIATION";
import {toPublicOrder} from "@/Lib/ORDER_VIEWS";
import {audit,auditFailure} from "@/Lib/AUDIT";

export const runtime="nodejs";
export const maxDuration=30;

function json(data:unknown,status=200){
  return NextResponse.json(data,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
}
async function safeAudit(event:string,request:Request,details:Record<string,string|number|boolean>){
  try{await audit(event,request,details);}catch{await auditFailure(event,request,details);}
}

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))return json({error:"invalid_id"},400);
  const key=clientKey(request);
  if(!await allowAttempt("orders:reconcile:"+key+":"+id,10_000))return json({error:"rate_limited"},429);
  const userId=await validUserSession(request.cookies.get("shiny_user_session")?.value||"");
  if(!userId)return json({error:"authentication_required"},401);
  const csrf=request.headers.get("x-csrf-token")||"";
  const stored=request.cookies.get("shiny_csrf")?.value||"";
  if(!csrf||csrf!==stored||!await validCsrf(csrf))return json({error:"invalid_csrf"},403);
  try{
    const user=await findUserById(userId);
    if(!user)return json({error:"authentication_required"},401);
    const order=await findOrderById(id);
    if(!order||order.userId!==userId)return json({error:"order_not_found"},404);
    if(order.status!=="PENDING"){
      return json({order:toPublicOrder(order),reconciliation:{kind:"unchanged",code:"order_not_pending"}},200);
    }
    const result=await reconcilePendingOrder(order.id);
    if(result.kind==="error"){
      await safeAudit("order_reconciliation_failed",request,{actor:userId,resource:order.id,result:result.code||"error"});
      const status=result.code==="provider_rate_limited"||result.code==="reconciliation_rate_limited"?429:result.code==="payment_not_configured"?503:502;
      return json({error:result.code||"reconciliation_failed",order:result.order?toPublicOrder(result.order):toPublicOrder(order)},status);
    }
    await safeAudit("order_reconciled",request,{actor:userId,resource:order.id,result:result.kind});
    return json({order:result.order?toPublicOrder(result.order):toPublicOrder(order),reconciliation:{kind:result.kind}},200);
  }catch{
    await safeAudit("order_reconciliation_failed",request,{actor:userId,resource:id,result:"unexpected_error"});
    return json({error:"reconciliation_failed"},503);
  }
}
