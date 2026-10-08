import assert from "node:assert/strict";
import {mkdtemp,rm,writeFile,mkdir,readFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";

const project=process.cwd();
const temp=await mkdtemp(path.join(os.tmpdir(),"shiny-p0-"));
await mkdir(path.join(temp,"Storage"),{recursive:true});
process.chdir(temp);
const auth=await import(pathToFileURL(path.join(project,"Src","Lib","AUTH.ts")).href);
const orders=await import(pathToFileURL(path.join(project,"Src","Lib","ORDERS.ts")).href);
const coupons=await import(pathToFileURL(path.join(project,"Src","Lib","COUPONS.ts")).href);
const store=await import(pathToFileURL(path.join(project,"Src","Lib","ADMIN_STORE.ts")).href);
const audit=await import(pathToFileURL(path.join(project,"Src","Lib","AUDIT.ts")).href);

async function products(value:string){await writeFile(path.join(temp,"Storage","products.json"),value,"utf8");}
async function couponsFile(value:string){await writeFile(path.join(temp,"Storage","coupons.json"),value,"utf8");}
async function resetOrders(){await rm(path.join(temp,"Storage","orders.json"),{force:true});await rm(path.join(temp,"Storage","promisse-pending-webhooks.json"),{force:true});}
function input(key:string,extra:Record<string,unknown>={}){return {userId:"u1",items:[{productId:"p1",name:"P1",quantity:1,unitPrice:10}],subtotal:10,discount:0,total:10,status:"PENDING" as const,idempotencyKeyHash:orders.hashIdempotencyKey(key),...extra};}

try{
  const usersPath=path.join(temp,"users-test.json");const us=auth.createUserStore(usersPath);
  const u1=await us.createUser("Alice"," Alice@Example.com ","StrongPass!123");assert(u1);
  assert.equal((await us.findUserByEmail("alice@example.com"))?.id,u1.id);
  const raw=await readFile(usersPath,"utf8");assert(raw.endsWith("\n"));assert(!raw.endsWith("\\n"));
  assert(await us.createUser("Bob","bob@example.com","StrongPass!456"));assert.equal((await us.readUsers()).length,2);
  await writeFile(usersPath,"{corrupt","utf8");await assert.rejects(()=>us.readUsers());
  const badParent=path.join(temp,"not-a-directory");await writeFile(badParent,"file","utf8");
  await assert.rejects(()=>auth.createUserStore(path.join(badParent,"users.json")).createUser("Carol","carol@example.com","StrongPass!789"));
  console.log("H01 PASS");

  await rm(path.join(temp,"Storage","products.json"),{force:true});assert.deepEqual(await store.readProducts(),[]);
  await products("[]\n");assert.deepEqual(await store.readProducts(),[]);
  await products(JSON.stringify([{id:"p1",name:"P1",price:10,description:"P1",active:true,stock:1}]));assert.equal((await store.readProducts()).length,1);
  await products("{invalid");await assert.rejects(()=>store.readProducts());
  console.log("H06 PASS");

  await products(JSON.stringify([{id:"p1",name:"P1",price:10,description:"P1",active:true,stock:1}]));await resetOrders();
  assert.equal(await orders.createOrder(input("too-many",{items:[{productId:"p1",name:"P1",quantity:2,unitPrice:10}],subtotal:20,total:20})),null);
  const [a,b]=await Promise.all([orders.createOrder(input("a")),orders.createOrder(input("b"))]);assert.equal(Number(Boolean(a))+Number(Boolean(b)),1);
  const winner=a||b;assert(winner);
  await orders.associateTransaction(winner.id,{id:"tx-stock",status:"pending",amount:1000,copyPaste:"x",qrCodeBase64:"x"});
  assert.equal((await orders.applyWebhookEvent({eventName:"payment.approved",transactionId:"tx-stock",amount:1000,timestamp:"t"})).status,"PAID");
  assert.equal((await orders.readOrders()).filter((o: {status:string})=>o.status==="PAID").reduce((n:number,o: {items:{quantity:number}[]})=>n+o.items[0].quantity,0),1);
  console.log("H02 PASS");

  await products(JSON.stringify([{id:"p1",name:"P1",price:10,description:"P1",active:true,stock:10}]));await resetOrders();await couponsFile("[]\n");
  const one=await coupons.createCoupon({code:"ONE",type:"percent",value:10,usageLimit:1,minimumAmount:0,productIds:[],active:true});assert(one);
  const [c1,c2]=await Promise.all([orders.createOrder(input("c1",{couponId:one.id,discount:1,total:9})),orders.createOrder(input("c2",{couponId:one.id,discount:1,total:9}))]);
  assert.equal(Number(Boolean(c1))+Number(Boolean(c2)),1);const co=c1||c2;assert(co);
  await orders.associateTransaction(co.id,{id:"tx-coupon",status:"pending",amount:900,copyPaste:"x",qrCodeBase64:"x"});
  assert.equal((await orders.applyWebhookEvent({eventName:"payment.approved",transactionId:"tx-coupon",amount:900,timestamp:"t"})).status,"PAID");
  assert.equal((await orders.applyWebhookEvent({eventName:"payment.approved",transactionId:"tx-coupon",amount:900,timestamp:"t"})).processed,false);
  assert.equal((await coupons.readCoupons())[0].usedCount,1);
  assert.equal(await orders.createOrder(input("c3",{couponId:one.id,discount:1,total:9})),null);
  await resetOrders();const fail=await coupons.createCoupon({code:"FAIL",type:"percent",value:10,usageLimit:1,minimumAmount:0,productIds:[],active:true});assert(fail);
  const fo=await orders.createOrder(input("fail",{couponId:fail.id,discount:1,total:9}));assert(fo);
  await orders.associateTransaction(fo.id,{id:"tx-fail",status:"pending",amount:900,copyPaste:"x",qrCodeBase64:"x"});
  assert.equal((await orders.applyWebhookEvent({eventName:"payment.failed",transactionId:"tx-fail",amount:900,timestamp:"t"})).status,"FAILED");
  assert.equal((await coupons.readCoupons()).find((c: {id:string;usedCount:number})=>c.id===fail.id)?.usedCount,0);
  assert(await orders.createOrder(input("retry",{couponId:fail.id})));
  const d1=await coupons.createCoupon({code:"DUP",type:"fixed",value:1,minimumAmount:0,productIds:[],active:true});const d2=await coupons.createCoupon({code:"OTHER",type:"fixed",value:1,minimumAmount:0,productIds:[],active:true});assert(d1&&d2);
  await assert.rejects(()=>coupons.updateCoupon(d2.id,{code:"DUP",type:"fixed",value:1,minimumAmount:0,productIds:[],active:true}),/duplicate_coupon_code/);
  console.log("H03 PASS");

  await resetOrders();const race=await orders.createOrder(input("race"));assert(race);
  await orders.recordPendingWebhook({eventKey:"payment.approved:tx-race",eventName:"payment.approved",transactionId:"tx-race",amount:1000,timestamp:"t",createdAt:"t"});
  const assoc=await orders.associateTransaction(race.id,{id:"tx-race",status:"pending",amount:1000,copyPaste:"x",qrCodeBase64:"x"});
  assert.equal(assoc.order?.status,"PAID");assert.equal(assoc.pendingApplied,true);
  assert.equal((await orders.applyWebhookEvent({eventName:"payment.approved",transactionId:"tx-race",amount:1000,timestamp:"t"})).processed,false);
  assert.equal((await orders.applyWebhookEvent({eventName:"payment.failed",transactionId:"tx-race",amount:1000,timestamp:"t"})).status,"PAID");
  await orders.recordPendingWebhook({eventKey:"payment.approved:unknown",eventName:"payment.approved",transactionId:"unknown",amount:1000,timestamp:"t",createdAt:"t"});
  assert((await orders.readPendingWebhooks()).some((e: {transactionId:string})=>e.transactionId==="unknown"));
  console.log("H04 PASS");

  await mkdir(path.join(temp,"Logs"),{recursive:true});await audit.auditFailure("payment_created",{headers:new Headers()},{resource:"order-test",result:"audit_failed"});
  console.log("H05 PASS");
  console.log("ALL P0 REGRESSION TESTS PASSED");
}finally{process.chdir(project);await rm(temp,{recursive:true,force:true});}
