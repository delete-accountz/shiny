import {readFile} from "node:fs/promises";
import path from "node:path";
import {readProducts} from "./ADMIN_STORE";
import {readPendingWebhooks,readOrders,type Order,PaymentProviderStatus} from "./ORDERS";
import {query} from "./DB";

export type AdminLog={at:string;event:string;actor:string;resource:string;result:string;reason:string;ip:string};

export type AdminOrderView={
  id:string;
  status:Order["status"];
  paymentStatus:PaymentProviderStatus|undefined;
  total:number;
  items:{name:string;quantity:number}[];
  transactionIdMasked?:string;
  createdAt:string;
  updatedAt:string;
  expiresAt?:string;
  stockReservationQuantity:number;
  couponReserved:boolean;
  needsReconciliation:boolean;
  lastReconciliationAt?:string;
  lastReconciliationError?:string;
};

export type AdminOrderMetrics={
  total:number;
  pending:number;
  paid:number;
  failed:number;
  cancelled:number;
  expired:number;
  revenue:number;
  ordersWithStockReservation:number;
  pendingStockUnits:number;
  ordersWithCouponReservation:number;
  unassociatedTransactions:number;
  reconciliationErrors:number;
  lastValidWebhook:AdminLog|null;
  lastRejectedWebhook:AdminLog|null;
  lastReconciliationAt:string|null;
};

function mask(value:string|undefined){
  if(!value)return undefined;
  return value.length<=4?"••••":"••••"+value.slice(-4);
}
function providerStatus(order:Order){
  if(order.providerStatus)return order.providerStatus;
  if(order.status==="PAID")return "PAID" as const;
  if(order.status==="FAILED")return "payment.failed" as const;
  if(order.status==="PENDING")return "pending" as const;
  return undefined;
}
function needsReconciliation(order:Order){
  if(order.status!=="PENDING")return false;
  if(order.lastReconciliationError)return true;
  const expiresAt=order.expiresAt?Date.parse(order.expiresAt):NaN;
  if(Number.isFinite(expiresAt)&&expiresAt<=Date.now())return true;
  const createdAt=Date.parse(order.createdAt);
  return Number.isFinite(createdAt)&&Date.now()-createdAt>=30*60_000;
}
async function readRelevantLogs():Promise<AdminLog[]>{
  const databaseMode=process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true";
  if(databaseMode){
    const rows=await query<{at:string;event:string;actor:string|null;resource:string|null;result:string|null;reason:string|null;ip:string|null}>(`SELECT created_at AS at,event,actor_id::text AS actor,resource_id AS resource,result,details->>'reason' AS reason,'database' AS ip FROM audit_events WHERE event IN ('payment_confirmed','payment_failed','promisse_webhook_rejected','payment_lookup') ORDER BY created_at DESC LIMIT 5000`);
    return rows.map(row=>({at:row.at,event:row.event,actor:row.actor||"Sistema",resource:row.resource||"",result:row.result||"",reason:row.reason||"",ip:row.ip||"database"}));
  }
  try{
    const raw=await readFile(path.join(process.cwd(),"Logs","audit.log"),"utf8");
    return raw.split(/(?:\r?\n|\\n)+/).map(line=>line.trim()).filter(Boolean).map(line=>{
      try{
        const item=JSON.parse(line) as Record<string,unknown>;
        const details=item.details&&typeof item.details==="object"&&!Array.isArray(item.details)?item.details as Record<string,unknown>:{};
        return typeof item.at==="string"&&typeof item.event==="string"?{
          at:item.at,event:item.event,actor:typeof details.actor==="string"?details.actor:"Sistema",
          resource:typeof details.resource==="string"?details.resource:"",
          result:typeof details.result==="string"?details.result:"",
          reason:typeof details.reason==="string"?details.reason:"",
          ip:typeof item.ip==="string"?item.ip:"unknown"
        }:null;
      }catch{return null;}
    }).filter((item):item is AdminLog=>item!==null).slice(-5000).reverse();
  }catch{return [];}
}
export async function readAdminOrders(){
  const [orders,pendingWebhooks,logs,products]=await Promise.all([readOrders(),readPendingWebhooks(),readRelevantLogs(),readProducts()]);
  const stockLimited=new Set(products.filter(product=>typeof product.stock==="number").map(product=>product.id));
  const views=orders.slice().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).map(order=>{
    const stockReservationQuantity=order.status==="PENDING"?order.items.reduce((sum,item)=>sum+(stockLimited.has(item.productId)?item.quantity:0),0):0;
    return {
      id:order.id,
      status:order.status,
      paymentStatus:providerStatus(order),
      total:order.total,
      items:order.items.map(item=>({name:item.name,quantity:item.quantity})),
      transactionIdMasked:mask(order.transactionId),
      createdAt:order.createdAt,
      updatedAt:order.updatedAt,
      expiresAt:order.expiresAt,
      stockReservationQuantity,
      couponReserved:order.status==="PENDING"&&Boolean(order.couponId),
      needsReconciliation:needsReconciliation(order),
      lastReconciliationAt:order.lastReconciliationAt,
      lastReconciliationError:order.lastReconciliationError
    } satisfies AdminOrderView;
  });
  const metrics={
    total:orders.length,
    pending:orders.filter(order=>order.status==="PENDING").length,
    paid:orders.filter(order=>order.status==="PAID").length,
    failed:orders.filter(order=>order.status==="FAILED").length,
    cancelled:orders.filter(order=>order.status==="CANCELLED").length,
    expired:orders.filter(order=>order.status==="EXPIRED").length,
    revenue:orders.filter(order=>order.status==="PAID").reduce((sum,order)=>sum+order.total,0),
    ordersWithStockReservation:views.filter(view=>view.stockReservationQuantity>0).length,
    pendingStockUnits:views.reduce((sum,view)=>sum+view.stockReservationQuantity,0),
    ordersWithCouponReservation:views.filter(view=>view.couponReserved).length,
    unassociatedTransactions:new Set(pendingWebhooks.map(item=>item.transactionId)).size,
    reconciliationErrors:views.filter(view=>Boolean(view.lastReconciliationError)).length,
    lastValidWebhook:logs.find(log=>log.event==="payment_confirmed"||log.event==="payment_failed")||null,
    lastRejectedWebhook:logs.find(log=>log.event==="promisse_webhook_rejected")||null,
    lastReconciliationAt:orders.map(order=>order.lastReconciliationAt).filter((value):value is string=>Boolean(value)).sort().at(-1)||logs.find(log=>log.event==="payment_lookup")?.at||null
  } satisfies AdminOrderMetrics;
  return {orders:views,metrics};
}
