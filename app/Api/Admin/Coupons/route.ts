import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {allowAttempt,clientKey,validAdminOwnerSession,validCsrf} from "@/Lib/SECURITY";
import {audit} from "@/Lib/AUDIT";
import {createCoupon,readCoupons} from "@/Lib/COUPONS";
import {readProducts} from "@/Lib/ADMIN_STORE";
import {findUserById} from "@/Lib/AUTH";
import {parseJsonBody} from "@/Lib/BODY_LIMITS";

const maxBody=16_384;
const schema=z.object({
  code:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/),
  type:z.enum(["percent","fixed"]),
  value:z.number().finite().positive(),
  startsAt:z.string().datetime({offset:true}).optional().or(z.literal("")),
  expiresAt:z.string().datetime({offset:true}).optional().or(z.literal("")),
  usageLimit:z.number().int().positive().max(100000000).optional(),
  minimumAmount:z.number().finite().min(0).max(100000000),
  productIds:z.array(z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)).max(100).default([]),
  category:z.string().trim().max(80).optional().or(z.literal("")),
  customerId:z.string().trim().max(100).optional().or(z.literal("")),
  active:z.boolean()
}).superRefine((value,ctx)=>{
  if(value.type==="percent"&&(value.value>100))ctx.addIssue({code:"custom",path:["value"],message:"percent_max"});
  if(value.startsAt&&value.expiresAt&&new Date(value.startsAt)>=new Date(value.expiresAt))ctx.addIssue({code:"custom",path:["expiresAt"],message:"date_order"});
});
function actor(){return (process.env.ADMIN_USER||"OWNER").trim()||"OWNER";}
async function auth(request:NextRequest,mutation=false){
  if(!await validAdminOwnerSession(request.cookies.get("shiny_admin_session")?.value||""))return "authentication_required";
  if(mutation){
    const csrf=request.headers.get("x-csrf-token")||"";const stored=request.cookies.get("shiny_csrf")?.value||"";
    if(!csrf||csrf!==stored||!await validCsrf(csrf))return "invalid_csrf";
  }
  return null;
}
async function rate(request:NextRequest){return !await allowAttempt("admin-coupons:"+clientKey(request),1000);}
async function validateReferences(input:z.infer<typeof schema>){
  const products=await readProducts();
  const known=new Set(products.map(product=>product.id));
  if(input.productIds.some(id=>!known.has(id)))return "invalid_product";
  if(input.customerId){
    const customer=await findUserById(input.customerId);
    if(!customer)return "invalid_customer";
  }
  if(input.type==="percent"&&input.value>100)return "invalid_value";
  return null;
}
export async function GET(request:NextRequest){
  const denied=await auth(request);if(denied)return NextResponse.json({error:denied},{status:401});
  if(await rate(request))return NextResponse.json({error:"rate_limited"},{status:429});
  try{return NextResponse.json({coupons:await readCoupons()},{headers:{"cache-control":"no-store"}});}
  catch{await audit("admin_coupons_list_failed",request,{actor:actor(),result:"storage_error"});return NextResponse.json({error:"storage_error"},{status:500});}
}
export async function POST(request:NextRequest){
  const denied=await auth(request,true);if(denied){await audit("admin_coupon_create_rejected",request,{actor:actor(),result:denied});return NextResponse.json({error:denied},{status:denied==="invalid_csrf"?403:401});}
  if(await rate(request))return NextResponse.json({error:"rate_limited"},{status:429});
  const body=await parseJsonBody(request,maxBody);if(!body.ok)return NextResponse.json({error:"invalid_input"},{status:body.reason==="too_large"?413:400});
  const parsed=schema.safeParse(body.data);
  if(!parsed.success)return NextResponse.json({error:"invalid_input"},{status:400});
  const referenceError=await validateReferences(parsed.data);if(referenceError)return NextResponse.json({error:referenceError},{status:400});
  try{
    const coupon=await createCoupon(parsed.data);
    if(!coupon){await audit("admin_coupon_create_rejected",request,{actor:actor(),result:"duplicate_code"});return NextResponse.json({error:"duplicate_code"},{status:409});}
    await audit("admin_coupon_created",request,{actor:actor(),resource:coupon.id,result:"success"});
    return NextResponse.json({ok:true,coupon},{status:201});
  }catch{await audit("admin_coupon_create_failed",request,{actor:actor(),result:"storage_error"});return NextResponse.json({error:"storage_error"},{status:500});}
}
