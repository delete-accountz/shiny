import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {allowAttempt,clientKey,validAdminOwnerSession,validCsrf} from "@/Lib/SECURITY";
import {audit} from "@/Lib/AUDIT";
import {deleteProduct,readProducts,updateProduct} from "@/Lib/ADMIN_STORE";
import {dispatchWebhookEvent} from "@/Lib/WEBHOOKS";
import {parseJsonBody} from "@/Lib/BODY_LIMITS";

const maxBody=16_384;
const productSchema=z.object({
  name:z.string().trim().min(1).max(160),
  price:z.number().finite().min(0).max(100000000),
  description:z.string().trim().max(5000),
  image:z.string().trim().max(500).refine(value=>value===""||value.startsWith("/")||/^https:\/\//i.test(value),{message:"image_url_invalid"}).optional().default(""),
  active:z.boolean(),
  stock:z.number().int().min(0).max(1000000000),
  category:z.string().trim().max(80).default(""),
  tags:z.array(z.string().trim().min(1).max(40)).max(30).default([])
});

function actor(){return (process.env.ADMIN_USER||"OWNER").trim()||"OWNER";}
function idIsValid(id:string){return /^[A-Za-z0-9_-]{1,80}$/.test(id);}
async function authorized(request:NextRequest,mutation=false){
  const session=request.cookies.get("shiny_admin_session")?.value||"";
  if(!await validAdminOwnerSession(session))return "authentication_required";
  if(mutation){
    const csrf=request.headers.get("x-csrf-token")||"";
    const stored=request.cookies.get("shiny_csrf")?.value||"";
    if(!csrf||csrf!==stored||!await validCsrf(csrf))return "invalid_csrf";
  }
  return null;
}
async function rateLimited(request:NextRequest,id:string){return !await allowAttempt("admin-product:"+clientKey(request)+":"+id,1000);}

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  if(!idIsValid(id))return NextResponse.json({error:"invalid_id"},{status:400});
  const auth=await authorized(request);
  if(auth)return NextResponse.json({error:auth},{status:401});
  if(await rateLimited(request,id))return NextResponse.json({error:"rate_limited"},{status:429});
  const product=(await readProducts()).find(item=>item.id===id);
  if(!product)return NextResponse.json({error:"not_found"},{status:404});
  return NextResponse.json({product},{headers:{"cache-control":"no-store"}});
}

export async function PUT(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  if(!idIsValid(id))return NextResponse.json({error:"invalid_id"},{status:400});
  const auth=await authorized(request,true);
  if(auth){await audit("admin_product_update_rejected",request,{actor:actor(),resource:id,result:auth});return NextResponse.json({error:auth},{status:auth==="invalid_csrf"?403:401});}
  if(await rateLimited(request,id))return NextResponse.json({error:"rate_limited"},{status:429});
  const body=await parseJsonBody(request,maxBody);
  if(!body.ok)return NextResponse.json({error:"request_too_large"},{status:body.reason==="too_large"?413:400});
  const parsed=productSchema.safeParse(body.data);
  if(!parsed.success){
    await audit("admin_product_update_rejected",request,{actor:actor(),resource:id,result:"invalid_input"});
    return NextResponse.json({error:"invalid_input",fields:parsed.error.issues.map(issue=>issue.path.join("."))},{status:400});
  }
  try{
    const before=(await readProducts()).find(item=>item.id===id);
    const product=await updateProduct(id,parsed.data);
    if(!product){
      await audit("admin_product_update_failed",request,{actor:actor(),resource:id,result:"not_found"});
      return NextResponse.json({error:"not_found"},{status:404});
    }
    await audit("admin_product_updated",request,{actor:actor(),resource:id,result:"success"});
    if(product.stock===0&&before?.stock!==0)void dispatchWebhookEvent("product.out_of_stock",{productId:product.id,name:product.name},request).catch(()=>{});
    return NextResponse.json({ok:true,product});
  }catch{
    await audit("admin_product_update_failed",request,{actor:actor(),resource:id,result:"storage_error"});
    return NextResponse.json({error:"storage_error"},{status:500});
  }
}

export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  if(!idIsValid(id))return NextResponse.json({error:"invalid_id"},{status:400});
  const auth=await authorized(request,true);
  if(auth){await audit("admin_product_delete_rejected",request,{actor:actor(),resource:id,result:auth});return NextResponse.json({error:auth},{status:auth==="invalid_csrf"?403:401});}
  if(await rateLimited(request,id))return NextResponse.json({error:"rate_limited"},{status:429});
  try{
    const deleted=await deleteProduct(id);
    if(!deleted){
      await audit("admin_product_delete_failed",request,{actor:actor(),resource:id,result:"not_found"});
      return NextResponse.json({error:"not_found"},{status:404});
    }
    await audit("admin_product_deleted",request,{actor:actor(),resource:id,result:"success"});
    return NextResponse.json({ok:true});
  }catch{
    await audit("admin_product_delete_failed",request,{actor:actor(),resource:id,result:"storage_error"});
    return NextResponse.json({error:"storage_error"},{status:500});
  }
}
