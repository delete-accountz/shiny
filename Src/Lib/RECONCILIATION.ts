import {applyWebhookEvent,findOrderById,readOrders,updateOrder,type Order} from "./ORDERS";
import {allowAttempt} from "./SECURITY";
import {parsePromisseLookup} from "./PROMISSE";
import * as dbReconciliation from "./DB/RECONCILIATION";
import {query} from "./DB";

export type ReconciliationResult={
  kind:"paid"|"pending"|"unchanged"|"error";
  order:Order|null;
  code?:string;
  httpStatus?:number;
};

type Options={fetchImpl?:typeof fetch;base?:string;apiKey?:string;now?:()=>Date;timeoutMs?:number};

const databaseMode=()=>process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true";
function stableError(code:string){return code.replace(/[^a-z0-9_:-]/gi,"_").slice(0,80);}
async function recordResult(orderId:string,code:string,now:Date){try{return await updateOrder(orderId,{lastReconciliationAt:now.toISOString(),lastReconciliationError:stableError(code)});}catch{return null;}}

async function paymentIdForOrder(orderId:string){
  const rows=await query<{id:string}>(`SELECT id FROM payments WHERE order_id=$1 LIMIT 1`,[orderId]);
  return rows[0]?.id||"";
}

async function reconcileDb(orderId:string,options:Options={}):Promise<ReconciliationResult>{
  const order=await findOrderById(orderId);
  if(!order)return {kind:"unchanged",order:null,code:"order_not_found"};
  if(order.status!=="PENDING")return {kind:"unchanged",order};
  if(!order.transactionId)return {kind:"error",order:await recordResult(order.id,"missing_transaction_id",options.now?.()||new Date()),code:"missing_transaction_id"};

  const paymentId=await paymentIdForOrder(order.id);
  if(!paymentId)return {kind:"error",order:await recordResult(order.id,"payment_not_found",options.now?.()||new Date()),code:"payment_not_found"};

  const claim=await dbReconciliation.claimPayment(paymentId,"manual_or_scheduled_reconciliation");
  if(!claim)return {kind:"unchanged",order:await findOrderById(order.id),code:"reconciliation_busy_or_exhausted"};

  const now=options.now?.()||new Date();
  const base=(options.base??process.env.PROMISSE_API_BASE_URL?.trim()??"").replace(/\/$/,"");
  const apiKey=options.apiKey??process.env.PROMISSE_API_KEY?.trim()??"";
  if(!base||!apiKey){
    await dbReconciliation.finishPaymentAttempt(claim,"FAILED","payment_not_configured","Promisse configuration missing",false);
    return {kind:"error",order:await recordResult(order.id,"payment_not_configured",now),code:"payment_not_configured"};
  }

  const fetchImpl=options.fetchImpl||fetch;
  let response:Response;
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),options.timeoutMs??5000);
    try{
      response=await fetchImpl(base+"/transactions/"+encodeURIComponent(order.transactionId),{
        method:"GET",headers:{Authorization:apiKey},cache:"no-store",signal:controller.signal
      });
    }finally{clearTimeout(timer);}
  }catch{
    await dbReconciliation.finishPaymentAttempt(claim,"RETRY","provider_timeout_or_network_error","Provider network/timeout",false);
    return {kind:"error",order:await recordResult(order.id,"provider_timeout_or_network_error",now),code:"provider_timeout_or_network_error"};
  }

  const raw=await response.json().catch(()=>null);
  if(response.status!==200){
    const code=response.status===401?"provider_auth_error":response.status===403?"provider_forbidden_scope":response.status===429?"provider_rate_limited":response.status>=500?"provider_unavailable":"provider_http_error";
    const retry=response.status===429||response.status>=500;
    await dbReconciliation.finishPaymentAttempt(claim,retry?"RETRY":"FAILED",code,"Provider HTTP "+response.status,false);
    return {kind:"error",order:await recordResult(order.id,code,now),code,httpStatus:response.status};
  }

  let provider;
  try{provider=parsePromisseLookup(response.status,raw,Math.round(order.total*100),order.transactionId);}
  catch(error){
    const code=error instanceof Error?stableError(error.message):"provider_response_invalid";
    await dbReconciliation.finishPaymentAttempt(claim,"FAILED",code,"Provider response validation failed",false);
    return {kind:"error",order:await recordResult(order.id,code,now),code,httpStatus:response.status};
  }

  if(provider.status==="pending"){
    await dbReconciliation.finishPaymentAttempt(claim,"RETRY","provider_pending","Provider remains pending",false);
    const updated=await updateOrder(order.id,{providerStatus:"pending",lastReconciliationAt:now.toISOString(),lastReconciliationError:undefined,expiresAt:provider.expiresAt||order.expiresAt});
    return {kind:"pending",order:updated,code:"pending",httpStatus:response.status};
  }

  try{
    const applied=await applyWebhookEvent({eventName:"payment.approved",transactionId:order.transactionId,amount:provider.amount,timestamp:now.toISOString()});
    if(applied.reason==="invalid_transition"){
      await dbReconciliation.finishPaymentAttempt(claim,"SUCCESS",undefined,undefined,true);
      return {kind:"unchanged",order:await findOrderById(order.id),code:"order_changed_during_reconciliation",httpStatus:response.status};
    }
    if(applied.reason){
      await dbReconciliation.finishPaymentAttempt(claim,"FAILED",stableError(applied.reason),applied.reason,false);
      return {kind:"error",order:await recordResult(order.id,stableError(applied.reason),now),code:applied.reason,httpStatus:response.status};
    }
    await dbReconciliation.finishPaymentAttempt(claim,"SUCCESS",undefined,undefined,true);
    const reconciled=await updateOrder(order.id,{providerStatus:"PAID",lastReconciliationAt:now.toISOString(),lastReconciliationError:undefined});
    return {kind:"paid",order:reconciled,code:"paid",httpStatus:response.status};
  }catch{
    await dbReconciliation.finishPaymentAttempt(claim,"RETRY","state_persistence_failed","Financial state persistence failed",false);
    return {kind:"error",order:await recordResult(order.id,"state_persistence_failed",now),code:"state_persistence_failed",httpStatus:response.status};
  }
}

export async function reconcilePendingOrder(orderId:string,options:Options={}):Promise<ReconciliationResult>{
  if(databaseMode())return reconcileDb(orderId,options);
  const order=await findOrderById(orderId);
  if(!order)return {kind:"unchanged",order:null,code:"order_not_found"};
  if(order.status!=="PENDING")return {kind:"unchanged",order};
  const allowed=await allowAttempt("promisse-reconcile:"+order.id,10_000);
  if(!allowed)return {kind:"error",order,code:"reconciliation_rate_limited",httpStatus:429};
  if(!order.transactionId)return {kind:"error",order:await recordResult(order.id,"missing_transaction_id",options.now?.()||new Date()),code:"missing_transaction_id"};
  const base=(options.base??process.env.PROMISSE_API_BASE_URL?.trim()??"").replace(/\/$/,"");
  const apiKey=options.apiKey??process.env.PROMISSE_API_KEY?.trim()??"";
  const now=options.now?.()||new Date();
  if(!base||!apiKey)return {kind:"error",order:await recordResult(order.id,"payment_not_configured",now),code:"payment_not_configured"};
  const fetchImpl=options.fetchImpl||fetch;
  let response:Response;
  try{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),options.timeoutMs??5000);
    try{response=await fetchImpl(base+"/transactions/"+encodeURIComponent(order.transactionId),{method:"GET",headers:{Authorization:apiKey},cache:"no-store",signal:controller.signal});}finally{clearTimeout(timer);}
  }catch{return {kind:"error",order:await recordResult(order.id,"provider_timeout_or_network_error",now),code:"provider_timeout_or_network_error"};}
  const raw=await response.json().catch(()=>null);
  if(response.status!==200){const code=response.status===401?"provider_auth_error":response.status===403?"provider_forbidden_scope":response.status===429?"provider_rate_limited":response.status>=500?"provider_unavailable":"provider_http_error";return {kind:"error",order:await recordResult(order.id,code,now),code,httpStatus:response.status};}
  let provider;try{provider=parsePromisseLookup(response.status,raw,Math.round(order.total*100),order.transactionId);}catch(error){const code=error instanceof Error?stableError(error.message):"provider_response_invalid";return {kind:"error",order:await recordResult(order.id,code,now),code,httpStatus:response.status};}
  if(provider.status==="pending"){const updated=await updateOrder(order.id,{providerStatus:"pending",lastReconciliationAt:now.toISOString(),lastReconciliationError:undefined,expiresAt:provider.expiresAt||order.expiresAt});return {kind:"pending",order:updated,code:"pending",httpStatus:response.status};}
  try{
    const applied=await applyWebhookEvent({eventName:"payment.approved",transactionId:order.transactionId,amount:provider.amount,timestamp:now.toISOString()});
    if(applied.reason==="invalid_transition")return {kind:"unchanged",order:await findOrderById(order.id),code:"order_changed_during_reconciliation",httpStatus:response.status};
    if(applied.reason)return {kind:"error",order:await recordResult(order.id,stableError(applied.reason),now),code:applied.reason,httpStatus:response.status};
    const reconciled=await updateOrder(order.id,{providerStatus:"PAID",lastReconciliationAt:now.toISOString(),lastReconciliationError:undefined});return {kind:"paid",order:reconciled,code:"paid",httpStatus:response.status};
  }catch{return {kind:"error",order:await recordResult(order.id,"state_persistence_failed",now),code:"state_persistence_failed",httpStatus:response.status};}
}

export async function reconcilePendingOrders(limit=10,options:Options={}){
  if(databaseMode()){
    const results:ReconciliationResult[]=[];
    const pendingWebhooks=await dbReconciliation.listDuePendingWebhooks(Math.max(1,Math.min(100,limit)));
    for(const item of pendingWebhooks.slice(0,limit)){
      const claim=await dbReconciliation.claimPendingWebhook(item.eventId);
      if(!claim)continue;
      const rows=await query<{id:string}>(`SELECT order_id AS "id" FROM payments WHERE provider_transaction_id=$1 LIMIT 1`,[claim.transactionId]);
      const order=rows[0]?await findOrderById(rows[0].id):null;
      if(!order){
        await dbReconciliation.markPendingWebhookRetry(claim.eventId,"transaction_unassociated",claim.attemptCount);
        continue;
      }
      if(Math.round(order.total*100)!==claim.amountCents){
        await dbReconciliation.rejectPendingWebhook(claim.eventId,"amount_mismatch");
        continue;
      }
      try{
        const applied=await applyWebhookEvent({eventName:claim.eventName,transactionId:claim.transactionId,amount:claim.amountCents,timestamp:new Date().toISOString()});
        if(applied.reason==="amount_mismatch"||applied.reason==="invalid_transition")await dbReconciliation.rejectPendingWebhook(claim.eventId,applied.reason);
        else if(applied.processed||applied.status)await dbReconciliation.resolvePendingWebhook(claim.eventId);
        const updated=await findOrderById(order.id);
        if(updated)results.push({kind:updated.status==="PAID"?"paid":updated.status==="PENDING"?"pending":"unchanged",order:updated,code:"pending_webhook_reconciled"});
      }catch{await dbReconciliation.markPendingWebhookRetry(claim.eventId,"webhook_apply_failed",claim.attemptCount);}
    }
    const remaining=Math.max(0,limit-results.length);
    if(remaining){
      const queue=await dbReconciliation.listReconciliationQueue(Math.max(1,Math.min(100,remaining)));
      for(const item of queue.slice(0,remaining))results.push(await reconcileDb(item.orderId,options));
    }
    return results;
  }
  const orders=(await readOrders()).filter(order=>order.status==="PENDING"&&Boolean(order.transactionId));
  const bounded=Math.max(1,Math.min(10,limit));const results:ReconciliationResult[]=[];
  for(const order of orders.slice(0,bounded))results.push(await reconcilePendingOrder(order.id,options));
  return results;
}

export async function reconciliationOperationalSnapshot(){
  if(!databaseMode())return {queue:[],pendingWebhooks:[],alerts:[]};
  return {
    queue:await dbReconciliation.listReconciliationQueue(100),
    pendingWebhooks:await dbReconciliation.listPendingWebhooksForReconciliation(100),
    alerts:await dbReconciliation.listOpenAlerts(100)
  };
}



