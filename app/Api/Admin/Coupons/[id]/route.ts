import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {allowAttempt,clientKey,validAdminOwnerSession,validCsrf} from "@/Lib/SECURITY";
import {audit} from "@/Lib/AUDIT";
import {deleteCoupon,readCoupons,updateCoupon} from "@/Lib/COUPONS";
import {readProducts} from "@/Lib/ADMIN_STORE";
import {findUserById} from "@/Lib/AUTH";
import {parseJsonBody} from "@/Lib/BODY_LIMITS";

const maxBody=16_384;
const schema=z.object({
  code:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/),type:z.enum(["percent","fixed"]),value:z.number().finite().positive(),
  startsAt:z.string().datetime({offset:true}).optional().or(z.literal("")),expiresAt:z.string().datetime({offset:true}).optional().or(z.literal("")),
  usageLimit:z.number().int().positive().max(100000000).optional(),minimumAmount:z.number().finite().min(0).max(100000000),
  productIds:z.array(z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)).max(100).default([]),category:z.string().trim().max(80).optional().or(z.literal("")),
  customerId:z.string().trim().max(100).optional().or(z.literal("")),active:z.boolean()
}).superRefine((value,ctx)=>{if(value.type==="percent"&&value.value>100)ctx.addIssue({code:"custom",path:["value"],message:"percent_max"});if(value.startsAt&&value.expiresAt&&new Date(value.startsAt)>=new Date(value.expiresAt))ctx.addIssue({code:"custom",path:["expiresAt"],message:"date_order"});});
function actor(){return (process.env.ADMIN_USER||"OWNER").trim()||"OWNER";}
async function auth(request:NextRequest,mutation=false){
  if(!await validAdminOwnerSession(request.cookies.get("shiny_admin_session")?.value||""))return "authentication_required";
  if(mutation){const csrf=request.headers.get("x-csrf-token")||"";const stored=request.cookies.get("shiny_csrf")?.value||"";if(!csrf||csrf!==stored||!await validCsrf(csrf))return "invalid_csrf";}
  return null;
}
async function rate(request:NextRequest,id:string){return !await allowAttempt("admin-coupon:"+clientKey(request)+":"+id,1000);}
async function refs(input:z.infer<typeof schema>){
  const products=await readProducts();const known=new Set(products.map(item=>item.id));
  if(input.productIds.some(id=>!known.has(id)))return "invalid_product";
  if(input.customerId&&!await findUserById(input.customerId))return "invalid_customer";
  if(input.type==="percent"&&input.value>100)return "invalid_value";
  return null;
}
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))return NextResponse.json({error:"invalid_id"},{status:400});
  const denied=await auth(request);if(denied)return NextResponse.json({error:denied},{status:401});if(await rate(request,id))return NextResponse.json({error:"rate_limited"},{status:429});
  const coupon=(await readCoupons()).find(item=>item.id===id);if(!coupon)return NextResponse.json({error:"not_found"},{status:404});return NextResponse.json({coupon});
}
export async function PUT(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const denied=await auth(request,true);if(denied)return NextResponse.json({error:denied},{status:denied==="invalid_csrf"?403:401});if(await rate(request,id))return NextResponse.json({error:"rate_limited"},{status:429});
  const body=await parseJsonBody(request,maxBody);if(!body.ok)return NextResponse.json({error:"invalid_input"},{status:body.reason==="too_large"?413:400});const parsed=schema.safeParse(body.data);if(!parsed.success)return NextResponse.json({error:"invalid_input"},{status:400});
  const ref=await refs(parsed.data);if(ref)return NextResponse.json({error:ref},{status:400});
  try{const coupon=await updateCoupon(id,parsed.data);if(!coupon)return NextResponse.json({error:"not_found"},{status:404});await audit("admin_coupon_updated",request,{actor:actor(),resource:id,result:"success"});return NextResponse.json({ok:true,coupon});}
  catch(error){if(error instanceof Error&&error.message==="duplicate_coupon_code"){await audit("admin_coupon_update_rejected",request,{actor:actor(),resource:id,result:"duplicate_code"});return NextResponse.json({error:"duplicate_code"},{status:409});}await audit("admin_coupon_update_failed",request,{actor:actor(),resource:id,result:"storage_error"});return NextResponse.json({error:"storage_error"},{status:500});}
}
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const denied=await auth(request,true);if(denied)return NextResponse.json({error:denied},{status:denied==="invalid_csrf"?403:401});if(await rate(request,id))return NextResponse.json({error:"rate_limited"},{status:429});
  try{const deleted=await deleteCoupon(id);if(!deleted){await audit("admin_coupon_delete_failed",request,{actor:actor(),resource:id,result:"not_found"});return NextResponse.json({error:"not_found"},{status:404});}await audit("admin_coupon_deleted",request,{actor:actor(),resource:id,result:"success"});return NextResponse.json({ok:true});}
  catch{await audit("admin_coupon_delete_failed",request,{actor:actor(),resource:id,result:"storage_error"});return NextResponse.json({error:"storage_error"},{status:500});}
}
