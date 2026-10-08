import {randomUUID} from "node:crypto";
import {query,withTransaction,withAdvisoryLock,type PoolClient} from "./index";
import type {Order,OrderItem,OrderStatus,PaymentProviderStatus} from "../ORDERS";

type DbOrder={
  id:string;userId:string;status:OrderStatus;subtotalCents:string|number;discountCents:string|number;totalCents:string|number;
  currency:string;couponId:string|null;idempotencyKeyHash:string;failureCode:string|null;
  transactionId:string|null;providerStatus:PaymentProviderStatus|null;copyPaste:string|null;qrCodeBase64:string|null;expiresAt:string|null;
  lastReconciliationAt:string|null;lastReconciliationError:string|null;createdAt:string;updatedAt:string;
};
type DbItem={productId:string;productName:string;quantity:string|number;unitPriceCents:string|number};
type DbProduct={id:string;name:string;priceCents:string|number;active:boolean;category:string};
type DbCoupon={id:string;couponType:"percent"|"fixed";value:string|number;startsAt:string|null;expiresAt:string|null;usageLimit:string|number|null;usedCount:string|number;minimumAmountCents:string|number;productIds:unknown;category:string|null;customerId:string|null;active:boolean};

const money=(value:string|number)=>Number(value)/100;
const int=(value:string|number)=>Number(value);
const cents=(value:number)=>Math.round(value*100);

function databaseError(error:unknown){return error instanceof Error?error.message:"database_error";}

async function loadOrder(client:PoolClient,id:string){
  const rows=await client.query<DbOrder>(`SELECT o.id,o.user_id AS "userId",o.status,o.subtotal_cents AS "subtotalCents",
    o.discount_cents AS "discountCents",o.total_cents AS "totalCents",o.currency,o.coupon_id AS "couponId",
    o.idempotency_key_hash AS "idempotencyKeyHash",o.failure_code AS "failureCode",
    p.provider_transaction_id AS "transactionId",p.provider_status AS "providerStatus",p.copy_paste AS "copyPaste",
    p.qr_code_base64 AS "qrCodeBase64",p.expires_at AS "expiresAt",o.last_reconciliation_at AS "lastReconciliationAt",
    o.last_reconciliation_error AS "lastReconciliationError",o.created_at AS "createdAt",o.updated_at AS "updatedAt"
    FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=$1 LIMIT 1`,[id]);
  if(!rows.rows[0])return null;
  const itemRows=await client.query<DbItem>(`SELECT product_id AS "productId",product_name AS "productName",
    quantity,unit_price_cents AS "unitPriceCents" FROM order_items WHERE order_id=$1 ORDER BY created_at ASC`,[id]);
  return mapOrder(rows.rows[0],itemRows.rows);
}

function mapOrder(row:DbOrder,items:DbItem[]):Order{
  return {
    id:row.id,userId:row.userId,
    items:items.map(item=>({productId:item.productId,name:item.productName,quantity:int(item.quantity),unitPrice:money(item.unitPriceCents)})),
    subtotal:money(row.subtotalCents),discount:money(row.discountCents),total:money(row.totalCents),
    couponId:row.couponId||undefined,status:row.status,providerStatus:row.providerStatus||undefined,
    transactionId:row.transactionId||undefined,copyPaste:row.copyPaste||undefined,qrCodeBase64:row.qrCodeBase64||undefined,
    expiresAt:row.expiresAt||undefined,idempotencyKeyHash:row.idempotencyKeyHash,processedWebhookEvents:[],
    createdAt:row.createdAt,updatedAt:row.updatedAt,failureCode:row.failureCode||undefined,
    lastReconciliationAt:row.lastReconciliationAt||undefined,lastReconciliationError:row.lastReconciliationError||undefined
  };
}

function parseProductIds(value:unknown):string[]{return Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"):[];}

async function lockProductStock(client:PoolClient,productId:string,quantity:number){
  const result=await client.query<DbProduct & {availableQuantity:string|number}>(`SELECT p.id,p.name,p.price_cents AS "priceCents",p.active,p.category,
    i.available_quantity AS "availableQuantity" FROM products p JOIN inventory i ON i.product_id=p.id
    WHERE p.id=$1 FOR UPDATE`,[productId]);
  const row=result.rows[0];
  if(!row||!row.active)return null;
  if(int(row.availableQuantity)<quantity)throw new Error("insufficient_stock");
  return row;
}

async function reserveCoupon(client:PoolClient,couponId:string,userId:string,orderId:string,productIds:string[],category:string|undefined,subtotalCents:number){
  const result=await client.query<DbCoupon>(`SELECT id,coupon_type AS "couponType",value,starts_at AS "startsAt",expires_at AS "expiresAt",
    usage_limit AS "usageLimit",used_count AS "usedCount",minimum_amount_cents AS "minimumAmountCents",
    product_ids AS "productIds",category,customer_id AS "customerId",active
    FROM coupons WHERE id=$1 FOR UPDATE`,[couponId]);
  const coupon=result.rows[0];
  if(!coupon)throw new Error("coupon_unavailable");
  const now=Date.now();
  if(!coupon.active)throw new Error("coupon_inactive");
  if(coupon.startsAt&&Date.parse(coupon.startsAt)>now)throw new Error("coupon_not_started");
  if(coupon.expiresAt&&Date.parse(coupon.expiresAt)<now)throw new Error("coupon_expired");
  if(coupon.customerId&&coupon.customerId!==userId)throw new Error("coupon_not_applicable");
  if(subtotalCents<int(coupon.minimumAmountCents))throw new Error("coupon_minimum_not_met");
  const allowed=parseProductIds(coupon.productIds);
  if(allowed.length&&!productIds.some(id=>allowed.includes(id)))throw new Error("coupon_not_applicable");
  if(coupon.category&&coupon.category!==category)throw new Error("coupon_not_applicable");
  const usageLimit=coupon.usageLimit===null?null:int(coupon.usageLimit);
  if(usageLimit!==null){
    const reserved=await client.query<{count:string}>(`SELECT count(*)::text AS count FROM coupon_reservations
      WHERE coupon_id=$1 AND state='RESERVED'`,[couponId]);
    if(int(coupon.usedCount)+int(reserved.rows[0]?.count||0)>=usageLimit)throw new Error("coupon_exhausted");
  }
  const value=int(coupon.value);
  const discount=coupon.couponType==="percent"
    ?Math.min(subtotalCents,Math.floor(subtotalCents*value/10000))
    :Math.min(subtotalCents,value);
  await client.query(`INSERT INTO coupon_reservations(id,coupon_id,order_id,user_id,state) VALUES($1,$2,$3,$4,'RESERVED')`,
    [randomUUID(),couponId,orderId,userId]);
  return discount;
}

async function transitionStock(client:PoolClient,orderId:string,from:OrderStatus,to:OrderStatus){
  if(from===to)return;
  const items=await client.query<{productId:string;quantity:string}>(`SELECT product_id AS "productId",quantity FROM order_items WHERE order_id=$1 FOR UPDATE`,[orderId]);
  for(const item of items.rows){
    const quantity=int(item.quantity);
    if(to==="PAID"&&from==="PENDING"){
      const result=await client.query(`UPDATE inventory SET reserved_quantity=reserved_quantity-$1,
        consumed_quantity=consumed_quantity+$1,version=version+1,updated_at=now()
        WHERE product_id=$2 AND reserved_quantity >= $1`,[quantity,item.productId]);
      if(result.rowCount!==1)throw new Error("stock_reservation_missing");
    }else if(from==="PENDING"&&(to==="FAILED"||to==="CANCELLED"||to==="EXPIRED")){
      const result=await client.query(`UPDATE inventory SET reserved_quantity=reserved_quantity-$1,
        available_quantity=available_quantity+$1,version=version+1,updated_at=now()
        WHERE product_id=$2 AND reserved_quantity >= $1`,[quantity,item.productId]);
      if(result.rowCount!==1)throw new Error("stock_reservation_missing");
    }
  }
}

async function transitionCoupon(client:PoolClient,orderId:string,from:OrderStatus,to:OrderStatus){
  if(from===to)return;
  if(from!=="PENDING")return;
  const reservation=await client.query<{couponId:string;state:string}>(`SELECT coupon_id AS "couponId",state
    FROM coupon_reservations WHERE order_id=$1 FOR UPDATE`,[orderId]);
  const row=reservation.rows[0];
  if(!row||row.state!=="RESERVED")return;
  if(to==="PAID"){
    const updated=await client.query(`UPDATE coupons SET used_count=used_count+1,version=version+1,updated_at=now()
      WHERE id=$1 AND (usage_limit IS NULL OR used_count < usage_limit)`,[row.couponId]);
    if(updated.rowCount!==1)throw new Error("coupon_commit_failed");
    await client.query(`UPDATE coupon_reservations SET state='CONSUMED',consumed_at=now() WHERE order_id=$1 AND state='RESERVED'`,[orderId]);
  }else if(to==="FAILED"||to==="CANCELLED"||to==="EXPIRED"){
    await client.query(`UPDATE coupon_reservations SET state='RELEASED',released_at=now() WHERE order_id=$1 AND state='RESERVED'`,[orderId]);
  }
}

export async function findOrderById(id:string){
  return withTransaction(async client=>loadOrder(client,id));
}
export async function findOrderByTransactionId(transactionId:string){
  const rows=await query<{id:string}>(`SELECT order_id AS id FROM payments WHERE provider_transaction_id=$1 LIMIT 1`,[transactionId]);
  return rows[0]?findOrderById(rows[0].id):null;
}
export async function findOrderByIdempotencyKey(keyHash:string){
  const rows=await query<{id:string}>(`SELECT id FROM orders WHERE idempotency_key_hash=$1 LIMIT 1`,[keyHash]);
  return rows[0]?findOrderById(rows[0].id):null;
}

export async function createOrder(input:Omit<Order,"id"|"createdAt"|"updatedAt"|"processedWebhookEvents">){
  try{
    return await withTransaction(async client=>{
      const duplicate=await client.query<{id:string}>(`SELECT id FROM orders WHERE idempotency_key_hash=$1 FOR UPDATE`,[input.idempotencyKeyHash]);
      if(duplicate.rows[0])return loadOrder(client,duplicate.rows[0].id);
      const orderId=randomUUID();
      const productRows:DbProduct[]=[];
      for(const item of input.items){
        const product=await lockProductStock(client,item.productId,item.quantity);
        if(!product)throw new Error("product_unavailable");
        if(int(product.priceCents)!==cents(item.unitPrice))throw new Error("price_changed");
        productRows.push(product);
      }
      let subtotalCents=0;
      for(const item of input.items)subtotalCents+=cents(item.unitPrice)*item.quantity;
      let discountCents=0;
      if(input.couponId){
        const category=productRows[0]?.category;
        discountCents=await reserveCoupon(client,input.couponId,input.userId,orderId,input.items.map(item=>item.productId),category,subtotalCents);
      }
      const totalCents=subtotalCents-discountCents;
      if(input.total<0||cents(input.total)!==totalCents)throw new Error("quote_changed");
      await client.query(`INSERT INTO orders(id,user_id,status,subtotal_cents,discount_cents,total_cents,currency,coupon_id,idempotency_key_hash)
        VALUES($1,$2,'PENDING',$3,$4,$5,'BRL',$6,$7)`,
        [orderId,input.userId,subtotalCents,discountCents,totalCents,input.couponId||null,input.idempotencyKeyHash]);
      for(const item of input.items){
        await client.query(`INSERT INTO order_items(id,order_id,product_id,product_name,quantity,unit_price_cents)
          VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),orderId,item.productId,item.name,item.quantity,cents(item.unitPrice)]);
        await client.query(`UPDATE inventory SET available_quantity=available_quantity-$1,reserved_quantity=reserved_quantity+$1,
          version=version+1,updated_at=now() WHERE product_id=$2 AND available_quantity >= $1`,[item.quantity,item.productId]);
      }
      await client.query(`INSERT INTO payments(id,order_id,status,provider_status,amount_cents,currency)
        VALUES($1,$2,'PENDING','pending',$3,'BRL')`,[randomUUID(),orderId,totalCents]);
      return loadOrder(client,orderId);
    });
  }catch(error){
    if(databaseError(error)==="23505")return findOrderByIdempotencyKey(input.idempotencyKeyHash);
    throw error;
  }
}

export async function associateTransaction(orderId:string,provider:{id:string;copyPaste:string;qrCodeBase64:string;expiresAt?:string;status:string;amount:number}){
  return withTransaction(async client=>{
    const order=await loadOrder(client,orderId);
    if(!order)throw new Error("order_not_found");
    if(cents(order.total)!==provider.amount)throw new Error("provider_amount_mismatch");
    const association=await client.query(`UPDATE payments SET provider_transaction_id=COALESCE(provider_transaction_id,$1),
      provider_status='pending',status='PENDING',copy_paste=$2,qr_code_base64=$3,expires_at=$4,
      updated_at=now(),version=version+1 WHERE order_id=$5 AND (provider_transaction_id IS NULL OR provider_transaction_id=$1)`,
      [provider.id,provider.copyPaste,provider.qrCodeBase64,provider.expiresAt||null,orderId]);
    if(association.rowCount!==1)throw new Error("provider_transaction_conflict");
    const pending=await client.query<{eventName:string;transactionId:string;amountCents:string;eventId:string;payloadHash:string}>(`SELECT event_name AS "eventName",
      transaction_id AS "transactionId",amount_cents AS "amountCents",event_id AS "eventId",payload_hash AS "payloadHash"
      FROM pending_webhook_events WHERE transaction_id=$1 AND resolved_at IS NULL ORDER BY received_at ASC LIMIT 1 FOR UPDATE`,[provider.id]);
    if(!pending.rows[0])return {order:await loadOrder(client,orderId),pendingApplied:false};
    const event=pending.rows[0];
    await applyWebhookInTransaction(client,event.eventName as "payment.approved"|"payment.failed",event.transactionId,int(event.amountCents),event.eventId,event.payloadHash);
    return {order:await loadOrder(client,orderId),pendingApplied:true};
  });
}

async function applyWebhookInTransaction(client:PoolClient,eventName:"payment.approved"|"payment.failed",transactionId:string,amountCents:number,eventId:string,payloadHash:string){
  const payment=await client.query<{id:string;orderId:string;status:OrderStatus;amountCents:string}>(`SELECT id,order_id AS "orderId",status,amount_cents AS "amountCents"
    FROM payments WHERE provider_transaction_id=$1 FOR UPDATE`,[transactionId]);
  const row=payment.rows[0];
  if(!row)return {found:false,processed:false,status:null as OrderStatus|null,reason:"unassociated"};
  if(int(row.amountCents)!==amountCents)return {found:true,processed:false,status:row.status,reason:"amount_mismatch"};
  const inserted=await client.query(`INSERT INTO webhook_events(id,event_id,event_name,transaction_id,amount_cents,payload_hash)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_id) DO NOTHING`,[randomUUID(),eventId,eventName,transactionId,amountCents,payloadHash]);
  if(inserted.rowCount===0){
    return {found:true,processed:false,status:row.status};
  }
  let next:OrderStatus=row.status;
  if(eventName==="payment.approved"){
    if(row.status==="PENDING")next="PAID";
    else if(row.status!=="PAID")return {found:true,processed:false,status:row.status,reason:"invalid_transition"};
  }else{
    if(row.status==="PENDING")next="FAILED";
    else if(row.status!=="FAILED")return {found:true,processed:false,status:row.status,reason:"invalid_transition"};
  }
  if(next!==row.status)await transitionStock(client,row.orderId,row.status,next);
  if(next!==row.status)await transitionCoupon(client,row.orderId,row.status,next);
  await client.query(`UPDATE payments SET status=$1,provider_status=$2,updated_at=now(),version=version+1 WHERE id=$3`,
    [next,eventName==="payment.approved"?"PAID":"payment.failed",row.id]);
  await client.query(`UPDATE orders SET status=$1,version=version+1,updated_at=now(),failure_code=$2 WHERE id=$3`,
    [next,next==="FAILED"?"payment_failed":null,row.orderId]);
  await client.query(`UPDATE webhook_events SET processed_at=now() WHERE event_id=$1`,[eventId]);
  await client.query(`UPDATE pending_webhook_events SET resolved_at=now() WHERE event_id=$1`,[eventId]);
  return {found:true,processed:true,status:next};
}

export async function applyWebhookEvent(input:{eventName:"payment.approved"|"payment.failed";transactionId:string;amount:number;timestamp:string;payloadHash?:string}){
  return withTransaction(async client=>{
    const eventId=input.eventName+":"+input.transactionId;
    const payloadHash=input.payloadHash||require("node:crypto").createHash("sha256").update(eventId,"utf8").digest("hex");
    const lock=await withAdvisoryLock(client,"promisse:webhook:"+input.transactionId,async()=>applyWebhookInTransaction(client,input.eventName,input.transactionId,input.amount,eventId,payloadHash));
    return lock;
  });
}

export async function recordPendingWebhook(event:{eventKey:string;eventName:"payment.approved"|"payment.failed";transactionId:string;amount:number;timestamp:string;createdAt:string;payloadHash?:string}){
  const payloadHash=event.payloadHash||require("node:crypto").createHash("sha256").update(event.eventKey,"utf8").digest("hex");
  const result=await query<{eventId:string}>(`INSERT INTO pending_webhook_events(id,event_id,event_name,transaction_id,amount_cents,payload_hash,received_at)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_id) DO NOTHING RETURNING event_id AS "eventId"`,
    [randomUUID(),event.eventKey,event.eventName,event.transactionId,event.amount,payloadHash,event.createdAt]);
  return result.length>0;
}

export async function readPendingWebhooks(){
  return query(`SELECT event_id AS "eventKey",event_name AS "eventName",transaction_id AS "transactionId",amount_cents AS amount,
    received_at AS "createdAt",next_attempt_at AS "nextRetryAt",attempt_count AS "attemptCount",last_error AS "lastError"
    FROM pending_webhook_events WHERE resolved_at IS NULL ORDER BY next_attempt_at ASC`);
}

export async function readOrders(){
  const rows=await query<{id:string}>(`SELECT id FROM orders ORDER BY created_at DESC`);
  const result:Order[]=[];
  for(const row of rows){const order=await findOrderById(row.id);if(order)result.push(order);}
  return result;
}

export async function updateOrder(id:string,update:Partial<Omit<Order,"id"|"createdAt"|"idempotencyKeyHash">>){
  return withTransaction(async client=>{
    const current=await loadOrder(client,id);
    if(!current)return null;
    const nextStatus=update.status||current.status;
    if(nextStatus!==current.status&&!((current.status==="PENDING"&&["PAID","FAILED","CANCELLED","EXPIRED"].includes(nextStatus))))throw new Error("invalid_order_transition");
    if(nextStatus!==current.status){
      await transitionStock(client,id,current.status,nextStatus);
      await transitionCoupon(client,id,current.status,nextStatus);
    }
    await client.query(`UPDATE orders SET status=$1,failure_code=$2,last_reconciliation_at=$3,last_reconciliation_error=$4,version=version+1,updated_at=now() WHERE id=$5`,
      [nextStatus,update.failureCode ?? current.failureCode ?? null,update.lastReconciliationAt?new Date(update.lastReconciliationAt):current.lastReconciliationAt ?? null,
       update.lastReconciliationError ?? current.lastReconciliationError ?? null,id]);
    if(update.transactionId||update.copyPaste||update.qrCodeBase64||update.expiresAt||update.providerStatus){
      await client.query(`UPDATE payments SET provider_transaction_id=COALESCE($1,provider_transaction_id),
        provider_status=COALESCE($2,provider_status),copy_paste=COALESCE($3,copy_paste),qr_code_base64=COALESCE($4,qr_code_base64),
        expires_at=COALESCE($5,expires_at),version=version+1,updated_at=now() WHERE order_id=$6`,
        [update.transactionId ?? null,update.providerStatus ?? null,update.copyPaste ?? null,update.qrCodeBase64 ?? null,update.expiresAt?new Date(update.expiresAt):null,id]);
    }
    return loadOrder(client,id);
  });
}

export async function markReconciliationRequired(orderId:string,reason:string){
  const rows=await query<{id:string}>(`UPDATE payments SET reconciliation_required=true,reconciliation_reason=$1,version=version+1,updated_at=now() WHERE order_id=$2 RETURNING id`,[reason.slice(0,500),orderId]);
  return rows.length>0;
}

export async function markWebhookProcessed(orderId:string,eventKey:string){
  const order=await findOrderById(orderId);
  if(!order)return {found:false,processed:false,order:null};
  const inserted=await query(`INSERT INTO webhook_events(id,event_id,event_name,transaction_id,payload_hash)
    VALUES($1,$2,'legacy',NULL,$3) ON CONFLICT(event_id) DO NOTHING`,[randomUUID(),eventKey,eventKey]);
  return {found:true,processed:inserted.length>0,order};
}
