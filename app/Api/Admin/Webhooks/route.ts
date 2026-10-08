import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {allowAttempt,clientKey,validAdminOwnerSession,validCsrf} from "@/Lib/SECURITY";
import {audit} from "@/Lib/AUDIT";
import {createWebhook,readWebhooks,validateWebhookUrl,webhookEvents} from "@/Lib/WEBHOOKS";
import {parseJsonBody} from "@/Lib/BODY_LIMITS";

const maxBody=65_536;
const base=z.object({
  name:z.string().trim().min(1).max(120),
  url:z.string().trim().max(2048),
  method:z.enum(["POST","PUT","PATCH"]),
  events:z.array(z.string()).min(1).max(10),
  active:z.boolean(),
  headers:z.record(z.string().trim().min(1).max(100),z.string().max(2000)).refine(value=>Object.keys(value).length<=20),
});
const createSchema=base.extend({secret:z.string().min(16).max(256)});
function actor(){return (process.env.ADMIN_USER||"OWNER").trim()||"OWNER";}
async function auth(request:NextRequest,mutation=false){
  if(!await validAdminOwnerSession(request.cookies.get("shiny_admin_session")?.value||""))return "authentication_required";
  if(mutation){const csrf=request.headers.get("x-csrf-token")||"";const stored=request.cookies.get("shiny_csrf")?.value||"";if(!csrf||csrf!==stored||!await validCsrf(csrf))return "invalid_csrf";}
  return null;
}
async function rate(request:NextRequest){return !await allowAttempt("admin-webhooks:"+clientKey(request),1000);}
function normalize(input:z.infer<typeof base>){
  if(input.events.some(event=>!(webhookEvents as readonly string[]).includes(event)))return null;
  return {...input,events:input.events as (typeof webhookEvents)[number][]};
}
export async function GET(request:NextRequest){
  const denied=await auth(request);if(denied)return NextResponse.json({error:denied},{status:401});if(await rate(request))return NextResponse.json({error:"rate_limited"},{status:429});
  try{return NextResponse.json({webhooks:await readWebhooks(),events:webhookEvents},{headers:{"cache-control":"no-store"}});}
  catch{await audit("admin_webhooks_list_failed",request,{actor:actor(),result:"storage_error"});return NextResponse.json({error:"storage_error"},{status:500});}
}
export async function POST(request:NextRequest){
  const denied=await auth(request,true);if(denied)return NextResponse.json({error:denied},{status:denied==="invalid_csrf"?403:401});if(await rate(request))return NextResponse.json({error:"rate_limited"},{status:429});
  const body=await parseJsonBody(request,maxBody);if(!body.ok)return NextResponse.json({error:"invalid_input"},{status:body.reason==="too_large"?413:400});const parsed=createSchema.safeParse(body.data);if(!parsed.success)return NextResponse.json({error:"invalid_input"},{status:400});
  const normalized=normalize(parsed.data);if(!normalized)return NextResponse.json({error:"invalid_event"},{status:400});
  const urlError=await validateWebhookUrl(normalized.url);if(urlError)return NextResponse.json({error:urlError},{status:400});
  try{const webhook=await createWebhook({...normalized,secret:parsed.data.secret});await audit("admin_webhook_created",request,{actor:actor(),resource:webhook.id,result:"success"});return NextResponse.json({ok:true,webhook},{status:201});}
  catch{await audit("admin_webhook_create_failed",request,{actor:actor(),result:"storage_error"});return NextResponse.json({error:"storage_error"},{status:500});}
}
