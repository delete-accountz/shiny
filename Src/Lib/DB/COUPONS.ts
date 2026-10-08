import {randomUUID} from "node:crypto";
import {query,withTransaction} from "./index";
import type {Coupon,CouponInput} from "../COUPONS";

type Row={id:string;code:string;couponType:"percent"|"fixed";value:string|number;startsAt:string|null;expiresAt:string|null;usageLimit:string|number|null;usedCount:string|number;minimumAmountCents:string|number;productIds:unknown;category:string|null;customerId:string|null;active:boolean;createdAt:string;updatedAt:string};
const money=(v:string|number)=>Number(v)/100;
const valueForDb=(input:CouponInput)=>input.type==="percent"?Math.round(input.value*100):Math.round(input.value*100);
function map(row:Row):Coupon{
  return {id:row.id,code:row.code,type:row.couponType,value:row.couponType==="percent"?Number(row.value)/100:money(row.value),
    startsAt:row.startsAt||undefined,expiresAt:row.expiresAt||undefined,usageLimit:row.usageLimit===null?undefined:Number(row.usageLimit),
    usedCount:Number(row.usedCount),consumedOrderIds:[],minimumAmount:money(row.minimumAmountCents),
    productIds:Array.isArray(row.productIds)?row.productIds.filter((x):x is string=>typeof x==="string"):[],
    category:row.category||undefined,customerId:row.customerId||undefined,active:row.active,createdAt:row.createdAt,updatedAt:row.updatedAt};
}
const select=`SELECT id,code,coupon_type AS "couponType",value,starts_at AS "startsAt",expires_at AS "expiresAt",
  usage_limit AS "usageLimit",used_count AS "usedCount",minimum_amount_cents AS "minimumAmountCents",product_ids AS "productIds",
  category,customer_id AS "customerId",active,created_at AS "createdAt",updated_at AS "updatedAt" FROM coupons`;

export async function readCoupons(){return (await query<Row>(select+" ORDER BY created_at ASC")).map(map);}
export async function createCoupon(input:CouponInput){
  try{
    const rows=await query<Row>(`INSERT INTO coupons(id,code,coupon_type,value,starts_at,expires_at,usage_limit,minimum_amount_cents,product_ids,category,customer_id,active)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12) RETURNING id,code,coupon_type AS "couponType",value,starts_at AS "startsAt",expires_at AS "expiresAt",
      usage_limit AS "usageLimit",used_count AS "usedCount",minimum_amount_cents AS "minimumAmountCents",product_ids AS "productIds",category,customer_id AS "customerId",active,created_at AS "createdAt",updated_at AS "updatedAt"`,
      [randomUUID(),input.code.trim().toUpperCase(),input.type,valueForDb(input),input.startsAt||null,input.expiresAt||null,input.usageLimit??null,
       Math.round(input.minimumAmount*100),JSON.stringify(input.productIds),input.category||null,input.customerId||null,input.active]);
    return rows[0]?map(rows[0]):null;
  }catch(error){if(error&&typeof error==="object"&&"code" in error&&(error as {code?:string}).code==="23505")return null;throw error;}
}
export async function updateCoupon(id:string,input:CouponInput){
  try{
    const rows=await query<Row>(`UPDATE coupons SET code=$1,coupon_type=$2,value=$3,starts_at=$4,expires_at=$5,usage_limit=$6,
      minimum_amount_cents=$7,product_ids=$8::jsonb,category=$9,customer_id=$10,active=$11,version=version+1,updated_at=now()
      WHERE id=$12 RETURNING id,code,coupon_type AS "couponType",value,starts_at AS "startsAt",expires_at AS "expiresAt",
      usage_limit AS "usageLimit",used_count AS "usedCount",minimum_amount_cents AS "minimumAmountCents",product_ids AS "productIds",category,customer_id AS "customerId",active,created_at AS "createdAt",updated_at AS "updatedAt"`,
      [input.code.trim().toUpperCase(),input.type,valueForDb(input),input.startsAt||null,input.expiresAt||null,input.usageLimit??null,
       Math.round(input.minimumAmount*100),JSON.stringify(input.productIds),input.category||null,input.customerId||null,input.active,id]);
    return rows[0]?map(rows[0]):null;
  }catch(error){if(error&&typeof error==="object"&&"code" in error&&(error as {code?:string}).code==="23505")throw new Error("duplicate_coupon_code");throw error;}
}
export async function deleteCoupon(id:string){const rows=await query<{id:string}>(`DELETE FROM coupons WHERE id=$1 RETURNING id`,[id]);return rows.length>0;}
export async function findValidCoupon(code:string,customerId:string,productIds:string[],category:string|undefined,total:number){
  const rows=await query<Row>(select+` WHERE code=$1 LIMIT 1`,[code.trim().toUpperCase()]);
  const row=rows[0];if(!row)return {coupon:null,error:"invalid"};
  const coupon=map(row);const now=new Date();
  if(!coupon.active)return {coupon:null,error:"inactive"};
  if(coupon.startsAt&&new Date(coupon.startsAt)>now)return {coupon:null,error:"not_started"};
  if(coupon.expiresAt&&new Date(coupon.expiresAt)<now)return {coupon:null,error:"expired"};
  if(coupon.usageLimit!==undefined&&coupon.usedCount>=coupon.usageLimit)return {coupon:null,error:"exhausted"};
  if(coupon.customerId&&coupon.customerId!==customerId||total<coupon.minimumAmount)return {coupon:null,error:"not_applicable"};
  if(coupon.productIds.length&&!productIds.some(id=>coupon.productIds.includes(id)))return {coupon:null,error:"not_applicable"};
  if(coupon.category&&coupon.category!==category)return {coupon:null,error:"not_applicable"};
  const discount=coupon.type==="percent"?Math.min(total,total*(coupon.value/100)):Math.min(total,coupon.value);
  return {coupon,discount};
}
export async function consumeCouponForApprovedOrder(id:string,orderId:string){
  return withTransaction(async client=>{
    const reservation=await client.query<{state:string}>(`SELECT state FROM coupon_reservations WHERE coupon_id=$1 AND order_id=$2 FOR UPDATE`,[id,orderId]);
    if(reservation.rows[0]?.state==="CONSUMED")return true;
    if(reservation.rows[0]?.state!=="RESERVED")return false;
    const updated=await client.query(`UPDATE coupons SET used_count=used_count+1,version=version+1,updated_at=now()
      WHERE id=$1 AND (usage_limit IS NULL OR used_count<usage_limit)`,[id]);
    if(updated.rowCount!==1)return false;
    await client.query(`UPDATE coupon_reservations SET state='CONSUMED',consumed_at=now() WHERE coupon_id=$1 AND order_id=$2 AND state='RESERVED'`,[id,orderId]);
    return true;
  });
}
