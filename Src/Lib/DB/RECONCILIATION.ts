import {randomUUID} from "node:crypto";
import {query,withTransaction,withAdvisoryLock,type PoolClient} from "./index";

export type Claim={attemptId:string;attemptNumber:number;paymentId:string;transactionId:string;orderId:string}|null;
export type QueueItem={paymentId:string;orderId:string;transactionId:string;status:string;amountCents:number;nextRetryAt:string|null;attemptCount:number};
const int=(value:string|number)=>Number(value);

const MAX_ATTEMPTS=8;
const BACKOFF_MS=[30_000,60_000,120_000,300_000,600_000,1_800_000,3_600_000,7_200_000];

async function insertAlert(client:PoolClient,severity:"INFO"|"WARNING"|"CRITICAL",alertType:string,paymentId:string|null,orderId:string|null,message:string,context:Record<string,unknown>={}){
  await client.query(`INSERT INTO operational_alerts(id,severity,alert_type,resource_type,resource_id,order_id,payment_id,message,context)
    VALUES($1,$2,$3,'payment',$4,$5,$6,$7,$8::jsonb)`,
    [randomUUID(),severity,alertType,paymentId,orderId,paymentId,message,JSON.stringify(context)]);
}

export async function claimPayment(paymentId:string,reason:string):Promise<Claim>{
  return withTransaction(async client=>{
    const locked=await withAdvisoryLock(client,"reconciliation:payment:"+paymentId,async()=>true);
    if(!locked)return null;
    const payment=(await client.query<{id:string;orderId:string;transactionId:string;status:string}>(`SELECT id,order_id AS "orderId",provider_transaction_id AS "transactionId",status FROM payments WHERE id=$1 FOR UPDATE`,[paymentId])).rows[0];
    if(!payment||payment.status!=="PENDING"||!payment.transactionId)return null;
    const latest=(await client.query<{attemptNumber:number;status:string;startedAt:string}>(`SELECT attempt_number AS "attemptNumber",status,started_at AS "startedAt"
      FROM reconciliation_attempts WHERE payment_id=$1 ORDER BY attempt_number DESC LIMIT 1`,[paymentId])).rows[0];
    if(latest?.status==="STARTED" && Date.parse(latest.startedAt)>Date.now()-120_000)return null;
    const attemptNumber=(latest?.attemptNumber||0)+1;
    if(attemptNumber>MAX_ATTEMPTS){
      await client.query(`UPDATE payments SET reconciliation_required=true,reconciliation_reason=$1,last_provider_query_at=now(),version=version+1,updated_at=now() WHERE id=$2`,
        ["retry_limit_exceeded",paymentId]);
      await insertAlert(client,"CRITICAL","reconciliation_retry_limit",paymentId,payment.orderId,"Limite de tentativas de reconciliaÃ§Ã£o excedido",{attemptNumber,maxAttempts:MAX_ATTEMPTS,reason});
      return null;
    }
    const attemptId=randomUUID();
    await client.query(`INSERT INTO reconciliation_attempts(id,payment_id,provider_transaction_id,reason,attempt_number,status,next_retry_at)
      VALUES($1,$2,$3,$4,$5,'STARTED',now())`,[attemptId,paymentId,payment.transactionId,reason,attemptNumber]);
    await client.query(`UPDATE payments SET reconciliation_required=true,last_provider_query_at=now(),version=version+1,updated_at=now() WHERE id=$1`,[paymentId]);
    return {attemptId,attemptNumber,paymentId:payment.id,transactionId:payment.transactionId,orderId:payment.orderId};
  });
}

function nextRetry(attemptNumber:number){return new Date(Date.now()+(BACKOFF_MS[Math.min(attemptNumber,BACKOFF_MS.length)-1]||BACKOFF_MS.at(-1)!));}

export async function finishPaymentAttempt(claim:Claim,status:"SUCCESS"|"RETRY"|"FAILED",errorCode:string|undefined,errorMessage:string|undefined,clearReconciliation=false){
  if(!claim)return;
  const retryAt=status==="RETRY"?nextRetry(claim.attemptNumber):null;
  await withTransaction(async client=>{
    await client.query(`UPDATE reconciliation_attempts SET status=$1,error_code=$2,error_message=$3,finished_at=now(),next_retry_at=$4 WHERE id=$5`,
      [status,errorCode||null,errorMessage||null,retryAt,claim.attemptId]);
    await client.query(`UPDATE payments SET reconciliation_required=$1,reconciliation_reason=$2,last_provider_query_at=now(),version=version+1,updated_at=now() WHERE id=$3`,
      [clearReconciliation,status==="SUCCESS"?null:(errorCode||"reconciliation_failed"),claim.paymentId]);
    if(status==="FAILED"){
      await insertAlert(client,"CRITICAL","reconciliation_failed",claim.paymentId,claim.orderId,"Falha crÃ­tica de reconciliaÃ§Ã£o de pagamento",{attemptNumber:claim.attemptNumber,errorCode:errorCode||"reconciliation_failed"});
    }
  });
}

export async function listReconciliationQueue(limit=50){
  const bounded=Math.max(1,Math.min(100,limit));
  return query<QueueItem>(`SELECT p.id AS "paymentId",p.order_id AS "orderId",p.provider_transaction_id AS "transactionId",
    p.status,p.amount_cents AS "amountCents",
    COALESCE((SELECT max(attempt_number) FROM reconciliation_attempts ra WHERE ra.payment_id=p.id),0)::int AS "attemptCount",
    (SELECT min(next_retry_at) FROM reconciliation_attempts ra WHERE ra.payment_id=p.id AND ra.status='RETRY' AND ra.next_retry_at>now()) AS "nextRetryAt"
    FROM payments p JOIN orders o ON o.id=p.order_id
    WHERE p.status='PENDING' AND p.provider_transaction_id IS NOT NULL
      AND (p.reconciliation_required=true OR o.created_at<=now()-interval '30 minutes')
      AND NOT EXISTS (SELECT 1 FROM reconciliation_attempts ra WHERE ra.payment_id=p.id AND ra.status='STARTED' AND ra.started_at>=now()-interval '2 minutes')
      AND NOT EXISTS (SELECT 1 FROM reconciliation_attempts ra WHERE ra.payment_id=p.id AND ra.status='RETRY' AND ra.next_retry_at>now())
    ORDER BY COALESCE((SELECT min(next_retry_at) FROM reconciliation_attempts ra WHERE ra.payment_id=p.id AND ra.status='RETRY' AND ra.next_retry_at>now()),o.created_at) ASC
    LIMIT $1`,[bounded]);
}

export async function listPendingWebhooksForReconciliation(limit=100){
  return query(`SELECT event_id AS "eventId",event_name AS "eventName",transaction_id AS "transactionId",amount_cents AS "amountCents",
    received_at AS "receivedAt",attempt_count AS "attemptCount",next_attempt_at AS "nextRetryAt",last_error AS "lastError"
    FROM pending_webhook_events WHERE resolved_at IS NULL AND next_attempt_at<=now()
    ORDER BY next_attempt_at ASC LIMIT $1`,[Math.max(1,Math.min(200,limit))]);
}

export async function listOpenAlerts(limit=100){
  return query(`SELECT id,severity,alert_type AS "alertType",resource_type AS "resourceType",resource_id AS "resourceId",
    order_id AS "orderId",payment_id AS "paymentId",message,context,created_at AS "createdAt"
    FROM operational_alerts WHERE acknowledged_at IS NULL ORDER BY created_at DESC LIMIT $1`,
    [Math.max(1,Math.min(200,limit))]);
}

export async function cleanupSecurityState(){
  await query("DELETE FROM csrf_tokens WHERE expires_at<=now()");
  await query("DELETE FROM rate_limit_buckets WHERE expires_at<=now()");
  await query("DELETE FROM session_revocations WHERE expires_at<=now()");
  await query("DELETE FROM sessions WHERE expires_at<=now()");
  await query("DELETE FROM admin_sessions WHERE expires_at<=now()");
}


export async function claimPendingWebhook(eventId:string){
  return withTransaction(async client=>{
    const locked=await withAdvisoryLock(client,"reconciliation:webhook:"+eventId,async()=>true);
    if(!locked)return null;
    const row=(await client.query<{eventId:string;eventName:"payment.approved"|"payment.failed";transactionId:string;amountCents:string;attemptCount:number}>(
      `SELECT event_id AS "eventId",event_name AS "eventName",transaction_id AS "transactionId",amount_cents AS "amountCents",attempt_count AS "attemptCount"
       FROM pending_webhook_events WHERE event_id=$1 AND resolved_at IS NULL FOR UPDATE`,[eventId])).rows[0];
    if(!row)return null;
    const attempt=row.attemptCount+1;
    if(attempt>MAX_ATTEMPTS){
      await client.query(`UPDATE pending_webhook_events SET attempt_count=$1,last_error=$2,next_attempt_at=now()+interval '24 hours' WHERE event_id=$3`,
        [attempt,"retry_limit_exceeded",eventId]);
      await insertAlert(client,"CRITICAL","pending_webhook_retry_limit",null,null,"Limite de tentativas do webhook pendente excedido",{eventId,attempt,maxAttempts:MAX_ATTEMPTS,transactionId:row.transactionId});
      return null;
    }
    await client.query(`UPDATE pending_webhook_events SET attempt_count=$1,next_attempt_at=$2,last_error=NULL WHERE event_id=$3`,
      [attempt,new Date(Date.now()+BACKOFF_MS[Math.min(attempt-1,BACKOFF_MS.length-1)]),eventId]);
    return {eventId:row.eventId,eventName:row.eventName,transactionId:row.transactionId,amountCents:int(row.amountCents),attemptCount:attempt};
  });
}

export async function resolvePendingWebhook(eventId:string){
  await query(`UPDATE pending_webhook_events SET resolved_at=now(),last_error=NULL WHERE event_id=$1 AND resolved_at IS NULL`,[eventId]);
}

export async function markPendingWebhookRetry(eventId:string,errorCode:string,attemptCount:number){
  const delay=BACKOFF_MS[Math.min(Math.max(attemptCount-1,0),BACKOFF_MS.length-1)]||BACKOFF_MS.at(-1)!;
  await query(`UPDATE pending_webhook_events SET last_error=$1,next_attempt_at=$2 WHERE event_id=$3 AND resolved_at IS NULL`,
    [errorCode.slice(0,500),new Date(Date.now()+delay),eventId]);
}

export async function listDuePendingWebhooks(limit=50){
  const bounded=Math.max(1,Math.min(100,limit));
  return query<{eventId:string;eventName:"payment.approved"|"payment.failed";transactionId:string;amountCents:string;attemptCount:number}>(
    `SELECT event_id AS "eventId",event_name AS "eventName",transaction_id AS "transactionId",amount_cents AS "amountCents",attempt_count AS "attemptCount"
     FROM pending_webhook_events WHERE resolved_at IS NULL AND next_attempt_at<=now()
     ORDER BY next_attempt_at ASC LIMIT $1`,[bounded]);
}


export async function rejectPendingWebhook(eventId:string,reason:string){
  await withTransaction(async client=>{
    const row=(await client.query<{transactionId:string}>(`SELECT transaction_id AS "transactionId" FROM pending_webhook_events WHERE event_id=$1 AND resolved_at IS NULL FOR UPDATE`,[eventId])).rows[0];
    if(!row)return;
    await client.query(`UPDATE pending_webhook_events SET resolved_at=now(),last_error=$1 WHERE event_id=$2`,[reason.slice(0,500),eventId]);
    await insertAlert(client,"CRITICAL","pending_webhook_rejected",null,null,"Webhook pendente rejeitado sem mutaÃ§Ã£o financeira",{eventId,transactionId:row.transactionId,reason});
  });
}



