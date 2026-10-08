import {NextRequest,NextResponse} from "next/server";
import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {allowAttempt,clientKey} from "@/Lib/SECURITY";
import {audit,auditFailure} from "@/Lib/AUDIT";
import {applyWebhookEvent,findOrderByTransactionId,recordPendingWebhook} from "@/Lib/ORDERS";
import {readRawBody} from "@/Lib/BODY_LIMITS";

export const runtime="nodejs";
export const maxDuration=10;
const maxBody=65_536;
async function safeAudit(event:string,request:Request,details:Record<string,string|number|boolean>){
  try{await audit(event,request,details);}catch{await auditFailure(event,request,details);}
}
export async function POST(request:NextRequest){
  const key=clientKey(request);
  if(!await allowAttempt("promisse-webhook:"+key,1000))return NextResponse.json({error:"rate_limited"},{status:429});
  const secret=process.env.PROMISSE_WEBHOOK_SECRET?.trim()||"";
  if(!secret)return NextResponse.json({error:"webhook_not_configured"},{status:503});
  const body=await readRawBody(request,maxBody);
  if(!body.ok)return NextResponse.json({error:body.reason==="too_large"?"payload_too_large":"invalid_body"},{status:body.reason==="too_large"?413:400});
  const raw=Buffer.from(body.body,"utf8");const payloadHash=createHash("sha256").update(raw).digest("hex");const signature=request.headers.get("promisse-signature")||"";
  const expected="sha256="+createHmac("sha256",secret).update(raw).digest("hex");
  const a=Buffer.from(signature);const b=Buffer.from(expected);
  if(a.length!==b.length||!timingSafeEqual(a,b)){await safeAudit("promisse_webhook_rejected",request,{result:"invalid_signature"});return NextResponse.json({error:"invalid_signature"},{status:401});}
  let event:unknown;try{event=JSON.parse(raw.toString("utf8"));}catch{await safeAudit("promisse_webhook_rejected",request,{result:"invalid_json"});return NextResponse.json({error:"invalid_json"},{status:400});}
  if(!event||typeof event!=="object")return NextResponse.json({error:"invalid_event"},{status:400});
  const envelope=event as Record<string,unknown>;const eventName=typeof envelope.event==="string"?envelope.event:"";
  const timestamp=typeof envelope.timestamp==="string"?envelope.timestamp:"";
  const data=typeof envelope.data==="object"&&envelope.data?envelope.data as Record<string,unknown>:null;
  if(!eventName||!timestamp||!data||typeof data.id!=="string")return NextResponse.json({error:"invalid_event"},{status:400});
  if(eventName==="webhook.test")return NextResponse.json({ok:true},{status:200});
  if(eventName!=="payment.approved"&&eventName!=="payment.failed")return NextResponse.json({ok:true},{status:200});

  const transactionId=data.id;const amount=typeof data.amount==="number"?data.amount:NaN;
  if(transactionId.length>200||!Number.isSafeInteger(amount)||amount<0){await safeAudit("promisse_webhook_rejected",request,{result:"invalid_data"});return NextResponse.json({error:"invalid_data"},{status:400});}
  const existing=await findOrderByTransactionId(transactionId);
  if(!existing){
    try{
      await recordPendingWebhook({eventKey:eventName+":"+transactionId,eventName,transactionId,amount,timestamp,createdAt:new Date().toISOString(),payloadHash});
      await safeAudit("promisse_webhook_pending",request,{actor:"system",resource:transactionId,result:"unassociated"});
      return NextResponse.json({ok:false,status:"pending_association",transactionId},{status:202});
    }catch{
      await safeAudit("promisse_webhook_failed",request,{actor:"system",resource:transactionId,result:"pending_persistence_failed"});
      return NextResponse.json({error:"webhook_persistence_failed"},{status:503});
    }
  }

  try{
    const result=await applyWebhookEvent({eventName,transactionId,amount,timestamp,payloadHash});
    if(result.reason==="amount_mismatch"||result.reason==="invalid_transition"){
      await safeAudit("promisse_webhook_rejected",request,{result:result.reason,resource:transactionId});
      return NextResponse.json({error:result.reason},{status:409});
    }
    if(result.processed)await safeAudit(eventName==="payment.approved"?"payment_confirmed":"payment_failed",request,{actor:"system",resource:existing.id,result:"success"});
    return NextResponse.json({ok:true,status:result.status},{status:200});
  }catch{
    await safeAudit("promisse_webhook_failed",request,{actor:"system",resource:transactionId,result:"state_persistence_failed"});
    return NextResponse.json({error:"webhook_processing_failed"},{status:503});
  }
}
