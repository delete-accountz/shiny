import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {allowAttempt,clientKey,validAdminOwnerSession,validCsrf} from "@/Lib/SECURITY";
import {audit} from "@/Lib/AUDIT";
import {sendWebhookTest,webhookEvents} from "@/Lib/WEBHOOKS";
import {parseJsonBody} from "@/Lib/BODY_LIMITS";

const maxBody=4_096;
const schema=z.object({event:z.string().max(64)}).strict();
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))return NextResponse.json({error:"invalid_id"},{status:400});
  if(!await validAdminOwnerSession(request.cookies.get("shiny_admin_session")?.value||""))return NextResponse.json({error:"authentication_required"},{status:401});
  const csrf=request.headers.get("x-csrf-token")||"";const stored=request.cookies.get("shiny_csrf")?.value||"";
  if(!csrf||csrf!==stored||!await validCsrf(csrf))return NextResponse.json({error:"invalid_csrf"},{status:403});
  if(!await allowAttempt("admin-webhook-test:"+clientKey(request)+":"+id,10000))return NextResponse.json({error:"rate_limited"},{status:429});
  const body=await parseJsonBody(request,maxBody);if(!body.ok)return NextResponse.json({error:"invalid_input"},{status:body.reason==="too_large"?413:400});
  const parsed=schema.safeParse(body.data);
  if(!parsed.success||!(webhookEvents as readonly string[]).includes(parsed.data.event))return NextResponse.json({error:"invalid_event"},{status:400});
  try{
    const delivery=await sendWebhookTest(id,parsed.data.event as (typeof webhookEvents)[number]);
    if(!delivery)return NextResponse.json({error:"not_found"},{status:404});
    await audit("admin_webhook_test",request,{actor:(process.env.ADMIN_USER||"OWNER").trim()||"OWNER",resource:id,result:delivery.status});
    return NextResponse.json({ok:delivery.status==="success",delivery},{status:delivery.status==="success"?200:502});
  }catch{
    await audit("admin_webhook_test_failed",request,{actor:(process.env.ADMIN_USER||"OWNER").trim()||"OWNER",resource:id,result:"failure"});
    return NextResponse.json({error:"delivery_failed"},{status:502});
  }
}
