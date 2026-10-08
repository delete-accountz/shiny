import {mkdir,readFile,rename,unlink,writeFile} from "node:fs/promises";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {readProducts} from "./ADMIN_STORE";
import {consumeCouponForApprovedOrder,readCoupons} from "./COUPONS";
import * as dbOrders from "./DB/ORDERS";

export type OrderStatus="PENDING"|"PAID"|"FAILED"|"CANCELLED"|"EXPIRED";
export type PaymentProviderStatus="pending"|"PAID"|"payment.failed";
export type OrderItem={productId:string;name:string;quantity:number;unitPrice:number};
export type Order={
  id:string;userId:string;items:OrderItem[];subtotal:number;discount:number;total:number;couponId?:string;
  status:OrderStatus;providerStatus?:PaymentProviderStatus;transactionId?:string;copyPaste?:string;qrCodeBase64?:string;expiresAt?:string;
  idempotencyKeyHash:string;processedWebhookEvents:string[];createdAt:string;updatedAt:string;failureCode?:string;
  lastReconciliationAt?:string;lastReconciliationError?:string;
};
type PendingWebhook={eventKey:string;eventName:"payment.approved"|"payment.failed";transactionId:string;amount:number;timestamp:string;createdAt:string;payloadHash?:string};
type ApplyResult={found:boolean;processed:boolean;status:OrderStatus|null;reason?:string};

const file=path.join(process.cwd(),"Storage","orders.json");
const pendingFile=path.join(process.cwd(),"Storage","promisse-pending-webhooks.json");
let chain:Promise<void>=Promise.resolve();
const databaseMode=()=>process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true";

async function readStored():Promise<Order[]>{
  try{
    const parsed=JSON.parse(await readFile(file,"utf8")) as unknown;
    if(!Array.isArray(parsed))throw new Error("orders_storage_invalid");
    return parsed as Order[];
  }catch(error){
    const code=error&&typeof error==="object"&&"code" in error?(error as {code?:string}).code:undefined;
    if(code==="ENOENT")return [];
    throw error;
  }
}
async function readPending():Promise<PendingWebhook[]>{
  try{
    const parsed=JSON.parse(await readFile(pendingFile,"utf8")) as unknown;
    if(!Array.isArray(parsed))throw new Error("pending_webhooks_storage_invalid");
    return parsed as PendingWebhook[];
  }catch(error){
    const code=error&&typeof error==="object"&&"code" in error?(error as {code?:string}).code:undefined;
    if(code==="ENOENT")return [];
    throw error;
  }
}
async function atomicWrite(target:string,content:string){
  await mkdir(path.dirname(target),{recursive:true});
  const temporary=target+"."+randomUUID()+".tmp";
  try{await writeFile(temporary,content,"utf8");await rename(temporary,target);}
  catch(error){await unlink(temporary).catch(()=>{});throw error;}
}
async function persist(items:Order[]){await atomicWrite(file,JSON.stringify(items,null,2)+"\n");}
async function persistPending(items:PendingWebhook[]){await atomicWrite(pendingFile,JSON.stringify(items,null,2)+"\n");}
async function lock<T>(operation:()=>Promise<T>):Promise<T>{
  const previous=chain;let release!:()=>void;chain=new Promise(resolve=>{release=resolve});await previous;
  try{return await operation();}finally{release();}
}
export function hashIdempotencyKey(value:string){return createHash("sha256").update(value,"utf8").digest("hex");}
export async function findOrderByIdempotencyKey(key:string){
  if(databaseMode())return dbOrders.findOrderByIdempotencyKey(hashIdempotencyKey(key));
  const hash=hashIdempotencyKey(key);return (await readStored()).find(order=>order.idempotencyKeyHash===hash)||null;
}
function reservedQuantity(orders:Order[],productId:string){
  return orders.filter(order=>order.status==="PENDING"||order.status==="PAID")
    .reduce((sum,order)=>sum+(order.items.find(item=>item.productId===productId)?.quantity||0),0);
}
async function validateOrderCapacity(orders:Order[],input:Pick<Order,"items"|"subtotal"|"discount"|"total"|"couponId">){
  const products=await readProducts();
  const byId=new Map(products.map(product=>[product.id,product]));
  let computedSubtotal=0;
  for(const item of input.items){
    const product=byId.get(item.productId);
    if(!product||product.active===false)return "product_unavailable";
    if(item.unitPrice!==product.price)return "price_changed";
    computedSubtotal+=product.price*item.quantity;
    if(typeof product.stock==="number"){
      const alreadyReserved=reservedQuantity(orders,item.productId);
      if(alreadyReserved+item.quantity>product.stock)return "insufficient_stock";
    }
  }
  if(!Number.isFinite(input.subtotal)||!Number.isFinite(input.discount)||!Number.isFinite(input.total)||input.discount<0||input.discount>computedSubtotal||Math.abs(input.subtotal-computedSubtotal)>0.000001||Math.abs(input.total-Math.max(0,input.subtotal-input.discount))>0.000001)return "quote_changed";
  if(input.couponId){
    const coupon=(await readCoupons()).find(item=>item.id===input.couponId);
    if(!coupon)return "coupon_unavailable";
    if(coupon.usageLimit!==undefined){
      const pendingReservations=orders.filter(order=>order.status==="PENDING"&&order.couponId===input.couponId).length;
      if(coupon.usedCount+pendingReservations>=coupon.usageLimit)return "coupon_exhausted";
    }
  }
  return null;
}
export async function createOrder(input:Omit<Order,"id"|"createdAt"|"updatedAt"|"processedWebhookEvents">){
  if(databaseMode())return dbOrders.createOrder(input);
  return lock(async()=>{
    const orders=await readStored();
    const existing=orders.find(order=>order.idempotencyKeyHash===input.idempotencyKeyHash);
    if(existing)return existing;
    const conflict=await validateOrderCapacity(orders,input);
    if(conflict)return null;
    const now=new Date().toISOString();
    const order:Order={...input,id:randomUUID(),processedWebhookEvents:[],createdAt:now,updatedAt:now};
    await persist([...orders,order]);
    return order;
  });
}
export function isValidOrderTransition(from:OrderStatus,to:OrderStatus){
  if(from===to)return true;
  return from==="PENDING"&&(to==="PAID"||to==="FAILED"||to==="CANCELLED"||to==="EXPIRED");
}
export async function updateOrder(id:string,update:Partial<Omit<Order,"id"|"createdAt"|"idempotencyKeyHash">>){
  if(databaseMode())return dbOrders.updateOrder(id,update);
  return lock(async()=>{
    const items=await readStored();const index=items.findIndex(order=>order.id===id);if(index<0)return null;
    const current=items[index];
    if(update.status&&!isValidOrderTransition(current.status,update.status))throw new Error("invalid_order_transition");
    const next={...current,...update,updatedAt:new Date().toISOString()};items[index]=next;await persist(items);return next;
  });
}
export async function findOrderById(id:string){return databaseMode()?dbOrders.findOrderById(id):(await readStored()).find(order=>order.id===id)||null;}
export async function findOrderByTransactionId(transactionId:string){
  if(databaseMode())return dbOrders.findOrderByTransactionId(transactionId);
  return (await readStored()).find(order=>order.transactionId===transactionId)||null;
}
export async function recordPendingWebhook(event:PendingWebhook){
  if(databaseMode())return dbOrders.recordPendingWebhook(event);
  return lock(async()=>{
    const items=await readPending();
    if(items.some(item=>item.eventKey===event.eventKey))return false;
    await persistPending([...items,event]);return true;
  });
}
async function removePendingWebhook(eventKey:string){
  const items=await readPending();const next=items.filter(item=>item.eventKey!==eventKey);
  if(next.length!==items.length)await persistPending(next);
}
export async function applyWebhookEvent(input:{eventName:"payment.approved"|"payment.failed";transactionId:string;amount:number;timestamp:string;payloadHash?:string}):Promise<ApplyResult>{
  if(databaseMode())return dbOrders.applyWebhookEvent(input);
  return lock(async()=>{
    const orders=await readStored();
    const index=orders.findIndex(order=>order.transactionId===input.transactionId);
    if(index<0)return {found:false,processed:false,status:null,reason:"unassociated"};
    const order=orders[index];
    const eventKey=input.eventName+":"+input.transactionId;
    if(order.processedWebhookEvents.includes(eventKey))return {found:true,processed:false,status:order.status};
    const expectedAmount=Math.round(order.total*100);
    if(!Number.isSafeInteger(input.amount)||input.amount!==expectedAmount)return {found:true,processed:false,status:order.status,reason:"amount_mismatch"};
    let nextStatus:OrderStatus=order.status;
    if(input.eventName==="payment.approved"){
      if(order.status==="PENDING"){
        if(order.couponId){
          const committed=await consumeCouponForApprovedOrder(order.couponId,order.id);
          if(!committed)throw new Error("coupon_commit_failed");
        }
        nextStatus="PAID";
      }else if(order.status!=="PAID"){
        return {found:true,processed:false,status:order.status,reason:"invalid_transition"};
      }
    }else if(order.status==="PENDING"){
      nextStatus="FAILED";
    }else if(order.status!=="FAILED"){
      return {found:true,processed:false,status:order.status,reason:"invalid_transition"};
    }
    const next={...order,status:nextStatus,providerStatus:(input.eventName==="payment.approved"?"PAID":"payment.failed") as PaymentProviderStatus,processedWebhookEvents:[...order.processedWebhookEvents,eventKey],updatedAt:new Date().toISOString(),failureCode:nextStatus==="FAILED"?"payment_failed":order.failureCode};
    orders[index]=next;await persist(orders);
    return {found:true,processed:true,status:next.status};
  });
}
export async function associateTransaction(orderId:string,provider:{id:string;copyPaste:string;qrCodeBase64:string;expiresAt?:string;status:string;amount:number}){
  if(databaseMode())return dbOrders.associateTransaction(orderId,provider);
  const associated=await updateOrder(orderId,{transactionId:provider.id,copyPaste:provider.copyPaste,qrCodeBase64:provider.qrCodeBase64,expiresAt:provider.expiresAt,status:"PENDING",providerStatus:"pending"});
  if(!associated)throw new Error("order_not_found");
  const pending=(await readPending()).find(item=>item.transactionId===provider.id);
  if(!pending)return {order:associated,pendingApplied:false};
  const result=await applyWebhookEvent({eventName:pending.eventName,transactionId:pending.transactionId,amount:pending.amount,timestamp:pending.timestamp});
  if(result.reason==="amount_mismatch")return {order:await findOrderByTransactionId(provider.id),pendingApplied:false,reason:result.reason};
  if(result.processed)await removePendingWebhook(pending.eventKey);
  return {order:await findOrderByTransactionId(provider.id),pendingApplied:result.processed,reason:result.reason};
}
export async function readPendingWebhooks(){return databaseMode()?dbOrders.readPendingWebhooks():readPending();}
export async function markReconciliationRequired(orderId:string,reason:string){
  if(databaseMode())return dbOrders.markReconciliationRequired(orderId,reason);
  return updateOrder(orderId,{lastReconciliationError:reason,lastReconciliationAt:new Date().toISOString()}).then(Boolean);
}
export async function markWebhookProcessed(orderId:string,eventKey:string){
  if(databaseMode())return dbOrders.markWebhookProcessed(orderId,eventKey);
  const order=await readStored();const current=order.find(item=>item.id===orderId);
  if(!current)return {found:false,processed:false,order:null};
  if(current.processedWebhookEvents.includes(eventKey))return {found:true,processed:false,order:current};
  const updated=await updateOrder(orderId,{processedWebhookEvents:[...current.processedWebhookEvents,eventKey]});
  return {found:true,processed:true,order:updated};
}
export async function readOrders(){return databaseMode()?dbOrders.readOrders():readStored();}
