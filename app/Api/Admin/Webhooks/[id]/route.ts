import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {allowAttempt,clientKey,validAdminOwnerSession,validCsrf} from "@/Lib/SECURITY";
import {audit} from "@/Lib/AUDIT";
import {deleteWebhook,getStoredWebhook,readWebhookDeliveries,readWebhooks,updateWebhook,validateWebhookUrl,webhookEvents} from "@/Lib/WEBHOOKS";
import {parseJsonBody} from "@/Lib/BODY_LIMITS";

const maxBody=65_536;
const base=z.object({name:z.string().trim().min(1).max(120),url:z.string().trim().max(2048),method:z.enum(["POST","PUT","PATCH"]),events:z.array(z.string()).min(1).max(10),active:z.boolean(),headers:z.record(z.string().trim().min(1).max(100),z.string().max(2000)).refine(value=>Object.keys(value).length<=20),secret:z.string().max(256).optional().default("")});
function actor(){return (process.env.ADMIN_USER||"OWNER").trim()||"OWNER";}
async function auth(request:NextRequest,mutation=false){
  if(!await validAdminOwnerSession(request.cookies.get("shiny_admin_session")?.value||""))return "authentication_required";
  if(mutation){const csrf=request.headers.get("x-csrf-token")||"";const stored=request.cookies.get("shiny_csrf")?.value||"";if(!csrf||csrf!==stored||!await validCsrf(csrf))return "invalid_csrf";}
  return null;
}
function validId(id:string){return /^[A-Za-z0-9_-]{1,100}$/.test(id);}
async function rate(request:NextRequest,id:string){return !await allowAttempt("admin-webhook:"+clientKey(request)+":"+id,1000);}
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;if(!validId(id))return NextResponse.json({error:"invalid_id"},{status:400});const denied=await auth(request);if(denied)return NextResponse.json({error:denied},{status:401});if(await rate(request,id))return NextResponse.json({error:"rate_limited"},{status:429});
  const webhook=(await readWebhooks()).find(item=>item.id===id);if(!webhook)return NextResponse.json({error:"not_found"},{status:404});
  return NextResponse.json({webhook,deliveries:await readWebhookDeliveries(id)});
}
export async function PUT(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;if(!validId(id))return NextResponse.json({error:"invalid_id"},{status:400});const denied=await auth(request,true);if(denied)return NextResponse.json({error:denied},{status:denied==="invalid_csrf"?403:401});if(await rate(request,id))return NextResponse.json({error:"rate_limited"},{status:429});
  const body=await parseJsonBody(request,maxBody);if(!body.ok)return NextResponse.json({error:"invalid_input"},{status:body.reason==="too_large"?413:400});const parsed=base.safeParse(body.data);if(!parsed.success)return NextResponse.json({error:"invalid_input"},{status:400});
  if(parsed.data.events.some(event=>!(webhookEvents as readonly string[]).includes(event)))return NextResponse.json({error:"invalid_event"},{status:400});
  const urlError=await validateWebhookUrl(parsed.data.url);if(urlError)return NextResponse.json({error:urlError},{status:400});
  const current=await getStoredWebhook(id);if(!current)return NextResponse.json({error:"not_found"},{status:404});
  try{
    const webhook=await updateWebhook(id,{...parsed.data,events:parsed.data.events as (typeof webhookEvents)[number][],secret:parsed.data.secret||"",headers:parsed.data.headers});
    await audit("admin_webhook_updated",request,{actor:actor(),resource:id,result:"success"});return NextResponse.json({ok:true,webhook});
  }catch{await audit("admin_webhook_update_failed",request,{actor:actor(),resource:id,result:"storage_error"});return NextResponse.json({error:"storage_error"},{status:500});}
}
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;if(!validId(id))return NextResponse.json({error:"invalid_id"},{status:400});const denied=await auth(request,true);if(denied)return NextResponse.json({error:denied},{status:denied==="invalid_csrf"?403:401});if(await rate(request,id))return NextResponse.json({error:"rate_limited"},{status:429});
  try{const deleted=await deleteWebhook(id);if(!deleted)return NextResponse.json({error:"not_found"},{status:404});await audit("admin_webhook_deleted",request,{actor:actor(),resource:id,result:"success"});return NextResponse.json({ok:true});}
  catch{await audit("admin_webhook_delete_failed",request,{actor:actor(),resource:id,result:"storage_error"});return NextResponse.json({error:"storage_error"},{status:500});}
}
