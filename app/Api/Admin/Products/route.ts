import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {allowAttempt,clientKey,validAdminOwnerSession,validCsrf} from "@/Lib/SECURITY";
import {audit} from "@/Lib/AUDIT";
import {createProduct,readProducts} from "@/Lib/ADMIN_STORE";
import {dispatchWebhookEvent} from "@/Lib/WEBHOOKS";
import {parseJsonBody} from "@/Lib/BODY_LIMITS";

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

const maxBody=16_384;

function actor(){return (process.env.ADMIN_USER||"OWNER").trim()||"OWNER";}
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
async function rateLimited(request:NextRequest){
  return !await allowAttempt("admin-products:"+clientKey(request),1000);
}

export async function GET(request:NextRequest){
  const auth=await authorized(request);
  if(auth){return NextResponse.json({error:auth},{status:401});}
  if(await rateLimited(request))return NextResponse.json({error:"rate_limited"},{status:429});
  try{
    return NextResponse.json({products:await readProducts()},{headers:{"cache-control":"no-store"}});
  }catch{
    await audit("admin_products_list_failed",request,{actor:actor(),result:"failure"});
    return NextResponse.json({error:"storage_error"},{status:500});
  }
}

export async function POST(request:NextRequest){
  const auth=await authorized(request,true);
  if(auth){await audit("admin_product_create_rejected",request,{actor:actor(),result:auth});return NextResponse.json({error:auth},{status:auth==="invalid_csrf"?403:401});}
  if(await rateLimited(request)){await audit("admin_product_create_rate_limited",request,{actor:actor(),result:"rate_limited"});return NextResponse.json({error:"rate_limited"},{status:429});}
  const contentLength=Number(request.headers.get("content-length")||0);
  if(contentLength>maxBody)return NextResponse.json({error:"request_too_large"},{status:413});
  const body=await parseJsonBody(request,maxBody);
  if(!body.ok)return NextResponse.json({error:"request_too_large"},{status:body.reason==="too_large"?413:400});
  const parsed=productSchema.safeParse(body.data);
  if(!parsed.success){
    await audit("admin_product_create_rejected",request,{actor:actor(),result:"invalid_input"});
    return NextResponse.json({error:"invalid_input",fields:parsed.error.issues.map(issue=>issue.path.join("."))},{status:400});
  }
  try{
    const product=await createProduct(parsed.data);
    await audit("admin_product_created",request,{actor:actor(),resource:product.id,result:"success"});
    if(product.stock===0)void dispatchWebhookEvent("product.out_of_stock",{productId:product.id,name:product.name},request).catch(()=>{});
    return NextResponse.json({ok:true,product},{status:201});
  }catch{
    await audit("admin_product_create_failed",request,{actor:actor(),result:"storage_error"});
    return NextResponse.json({error:"storage_error"},{status:500});
  }
}
