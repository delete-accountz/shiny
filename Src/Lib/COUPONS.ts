import {mkdir,readFile,rename,unlink,writeFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import * as dbCoupons from "./DB/COUPONS";

export type CouponType="percent"|"fixed";
export type Coupon={
  id:string;code:string;type:CouponType;value:number;startsAt?:string;expiresAt?:string;usageLimit?:number;
  usedCount:number;consumedOrderIds?:string[];minimumAmount:number;productIds:string[];category?:string;customerId?:string;active:boolean;createdAt:string;updatedAt:string;
};
export type CouponInput={code:string;type:CouponType;value:number;startsAt?:string;expiresAt?:string;usageLimit?:number;minimumAmount:number;productIds:string[];category?:string;customerId?:string;active:boolean};
const couponsPath=path.join(process.cwd(),"Storage","coupons.json");
let chain:Promise<void>=Promise.resolve();
const databaseMode=()=>process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true";
async function readStored():Promise<Coupon[]>{
  try{const parsed=JSON.parse(await readFile(couponsPath,"utf8")) as unknown;if(!Array.isArray(parsed))throw new Error("coupons_storage_invalid");return parsed as Coupon[];}
  catch(error){const code=error&&typeof error==="object"&&"code" in error?(error as {code?:string}).code:undefined;if(code==="ENOENT")return [];throw error;}
}
async function persist(coupons:Coupon[]){
  await mkdir(path.dirname(couponsPath),{recursive:true});
  const temporary=couponsPath+"."+randomUUID()+".tmp";
  try{await writeFile(temporary,JSON.stringify(coupons,null,2)+"\n","utf8");await rename(temporary,couponsPath);}
  catch(error){await unlink(temporary).catch(()=>{});throw error;}
}
async function lock<T>(operation:()=>Promise<T>):Promise<T>{const previous=chain;let release!:()=>void;chain=new Promise(resolve=>{release=resolve});await previous;try{return await operation();}finally{release();}}
export async function readCoupons(){return databaseMode()?dbCoupons.readCoupons():readStored();}
export async function createCoupon(input:CouponInput){
  if(databaseMode())return dbCoupons.createCoupon(input);
  return lock(async()=>{
    const coupons=await readStored();const code=input.code.trim().toUpperCase();
    if(coupons.some(item=>item.code===code))return null;
    const now=new Date().toISOString();const coupon:Coupon={...input,code,id:randomUUID(),usedCount:0,consumedOrderIds:[],createdAt:now,updatedAt:now};
    await persist([...coupons,coupon]);return coupon;
  });
}
export async function updateCoupon(id:string,input:CouponInput){
  if(databaseMode())return dbCoupons.updateCoupon(id,input);
  return lock(async()=>{
    const coupons=await readStored();const index=coupons.findIndex(item=>item.id===id);if(index<0)return null;
    const code=input.code.trim().toUpperCase();
    if(coupons.some((item,itemIndex)=>itemIndex!==index&&item.code===code))throw new Error("duplicate_coupon_code");
    const current=coupons[index];const coupon:Coupon={...current,...input,code,id,updatedAt:new Date().toISOString()};
    const next=[...coupons];next[index]=coupon;await persist(next);return coupon;
  });
}
export async function deleteCoupon(id:string){if(databaseMode())return dbCoupons.deleteCoupon(id);return lock(async()=>{const coupons=await readStored();if(!coupons.some(item=>item.id===id))return false;await persist(coupons.filter(item=>item.id!==id));return true;});}
export function couponValidity(coupon:Coupon,now=new Date()){
  if(!coupon.active)return "inactive";
  if(coupon.startsAt&&new Date(coupon.startsAt)>now)return "not_started";
  if(coupon.expiresAt&&new Date(coupon.expiresAt)<now)return "expired";
  if(coupon.usageLimit!==undefined&&coupon.usedCount>=coupon.usageLimit)return "exhausted";
  return null;
}
export function couponMatches(coupon:Coupon,customerId:string,productIds:string[],category:string|undefined,total:number){
  if(coupon.customerId&&coupon.customerId!==customerId)return false;
  if(total<coupon.minimumAmount)return false;
  if(coupon.productIds.length&&!productIds.some(id=>coupon.productIds.includes(id)))return false;
  if(coupon.category&&coupon.category!==category)return false;
  return true;
}
export async function findValidCoupon(code:string,customerId:string,productIds:string[],category:string|undefined,total:number){
  if(databaseMode())return dbCoupons.findValidCoupon(code,customerId,productIds,category,total);
  const coupon=(await readStored()).find(item=>item.code===code.trim().toUpperCase());
  if(!coupon)return {coupon:null,error:"invalid"};
  const validity=couponValidity(coupon);
  if(validity)return {coupon:null,error:validity};
  if(!couponMatches(coupon,customerId,productIds,category,total))return {coupon:null,error:"not_applicable"};
  const discount=coupon.type==="percent"?Math.min(total,total*(coupon.value/100)):Math.min(total,coupon.value);
  return {coupon,discount};
}
export async function consumeCouponForApprovedOrder(id:string,orderId:string){
  if(databaseMode())return dbCoupons.consumeCouponForApprovedOrder(id,orderId);
  return lock(async()=>{
    const coupons=await readStored();const index=coupons.findIndex(item=>item.id===id);if(index<0)return false;
    const coupon=coupons[index];const consumed=coupon.consumedOrderIds||[];
    if(consumed.includes(orderId))return true;
    const next=[...coupons];next[index]={...coupon,usedCount:coupon.usedCount+1,consumedOrderIds:[...consumed,orderId],updatedAt:new Date().toISOString()};await persist(next);return true;
  });
}
export async function consumeCoupon(id:string){return consumeCouponForApprovedOrder(id,"legacy:"+randomUUID());}
