import {randomUUID} from "node:crypto";
import {query} from "./index";

function safe(value:unknown){return String(value).replace(/[\r\n\t]+/g," ").slice(0,500);}
function filtered(details:Record<string,string|number|boolean>){
  return Object.fromEntries(Object.entries(details)
    .filter(([key])=>!/(key|token|secret|password|authorization|cookie|session|payload|signature)/i.test(key))
    .map(([key,value])=>[safe(key),safe(value)]));
}
function uuid(value:unknown){return typeof value==="string"&&/^[0-9a-f-]{36}$/i.test(value)?value:null;}
export async function auditDb(event:string,request:Request,details:Record<string,string|number|boolean>={},failure=false){
  const d=filtered(details);
  const actorId=uuid(d.actor)||uuid(d.userId)||null;
  const orderId=uuid(d.orderId)||uuid(d.resource);
  const paymentId=uuid(d.paymentId)||null;
  const requestId=request.headers.get("x-request-id")?.slice(0,128)||null;
  await query(`INSERT INTO audit_events(id,event,actor_id,resource_type,resource_id,request_id,order_id,payment_id,result,details)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [randomUUID(),safe(failure?"audit_failure":event),actorId,typeof d.resourceType==="string"?safe(d.resourceType):null,
     typeof d.resource==="string"?safe(d.resource):null,requestId,orderId,paymentId,
     typeof d.result==="string"?safe(d.result):null,JSON.stringify(d)]);
}
