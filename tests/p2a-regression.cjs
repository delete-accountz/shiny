const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const os=require("node:os");
const path=require("node:path");
const cp=require("node:child_process");
const Module=require("node:module");
const fsSync=require("node:fs");

(async()=>{
 const project=process.cwd();
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),"shiny-p2a-"));
 const compiled=path.join(temp,"compiled");
 const routes=path.join(temp,"routes");
 await fs.mkdir(compiled,{recursive:true});await fs.mkdir(routes,{recursive:true});
 const ts=path.join(project,"node_modules","typescript","bin","tsc");
 const libs=["SECURITY.ts","AUTH.ts","COUPONS.ts","ADMIN_STORE.ts","CART.ts","ORDERS.ts","PROMISSE.ts","ORDER_VIEWS.ts","RECONCILIATION.ts","ADMIN_ORDERS.ts","AUDIT.ts"];
 cp.execFileSync(process.execPath,[ts,"--target","ES2022","--module","commonjs","--moduleResolution","node","--esModuleInterop","--skipLibCheck","--outDir",compiled,...libs.map(name=>path.join(project,"Src","Lib",name))],{stdio:"inherit"});
 const source=async rel=>fs.readFile(path.join(project,rel),"utf8");
 const compileRoute=async(rel,name)=>{
   const code=await source(rel);
   const out=path.join(routes,name+".cjs");
   const result=require("typescript").transpileModule(code,{compilerOptions:{target:require("typescript").ModuleKind?require("typescript").ScriptTarget.ES2022:99,module:require("typescript").ModuleKind.CommonJS,esModuleInterop:true}});
   await fs.writeFile(out,result.outputText,"utf8");return out;
 };
 const routeList=await compileRoute("app/Api/Orders/route.ts","orders-list");
 const routeItem=await compileRoute("app/Api/Orders/[id]/route.ts","orders-item");
 const routeReconcile=await compileRoute("app/Api/Orders/[id]/Reconcile/route.ts","orders-reconcile");
 const originalResolve=Module._resolveFilename;
 Module._resolveFilename=function(request,parent,isMain,options){
   if(request.startsWith("@/Lib/"))return path.join(compiled,request.slice(6)+".js");
   return originalResolve.call(this,request,parent,isMain,options);
 };
 process.env.NODE_ENV="test";
 process.chdir(temp);
 process.env.NODE_PATH=path.join(project,"node_modules");Module._initPaths();
 process.env.ADMIN_ACCESS_LEVEL="OWNER";process.env.ADMIN_ACCESS_KEY="test-admin";
 const security=require(path.join(compiled,"SECURITY.js"));
 const auth=require(path.join(compiled,"AUTH.js"));
 const orders=require(path.join(compiled,"ORDERS.js"));
 const coupons=require(path.join(compiled,"COUPONS.js"));
 const reconciliation=require(path.join(compiled,"RECONCILIATION.js"));
 const adminOrders=require(path.join(compiled,"ADMIN_ORDERS.js"));
 const orderViews=require(path.join(compiled,"ORDER_VIEWS.js"));
 const {NextRequest}=require("next/server");
 const routeListHandler=require(routeList);
 const routeItemHandler=require(routeItem);
 const routeReconcileHandler=require(routeReconcile);
 const now=new Date().toISOString();
 await fs.mkdir(path.join(temp,"Storage"),{recursive:true});
 await fs.mkdir(path.join(temp,"Logs"),{recursive:true});
 await fs.writeFile(path.join(temp,"Storage","users.json"),JSON.stringify([
  {id:"user-a",username:"alice",email:"alice@test.invalid",passwordHash:"test",createdAt:now},
  {id:"user-b",username:"bob",email:"bob@test.invalid",passwordHash:"test",createdAt:now}
 ]),"utf8");
 await fs.writeFile(path.join(temp,"Storage","products.json"),JSON.stringify([{id:"p1",name:"P1",price:10,description:"P1",active:true,stock:50}]),"utf8");
 await fs.writeFile(path.join(temp,"Storage","coupons.json"),"[]","utf8");
 const cookie=(name,value,extra="")=>name+"="+value+(extra?"; "+extra:"");
 const request=(url,opts={})=>new NextRequest("https://shiny.local"+url,opts);
 const sessionA=security.createUserSession("user-a");
 const sessionB=security.createUserSession("user-b");
 const owner=security.createAdminSession();
 const mk=async(idempotency,userId,extra={})=>orders.createOrder({userId,items:[{productId:"p1",name:"P1",quantity:1,unitPrice:10}],subtotal:10,discount:0,total:10,status:"PENDING",idempotencyKeyHash:orders.hashIdempotencyKey(idempotency),...extra});
 const orderA=await mk("a-order","user-a");const orderB=await mk("b-order","user-b");assert(orderA&&orderB);
 try{
  let r=await routeItemHandler.GET(request("/Api/Orders/"+orderA.id,{headers:{}}),{params:Promise.resolve({id:orderA.id})});
  assert.equal(r.status,401);
  const own=r=await routeItemHandler.GET(request("/Api/Orders/"+orderA.id,{headers:{cookie:cookie("shiny_user_session",sessionA),"x-shiny-rate-id":"rate-a-item-00001"}}),{params:Promise.resolve({id:orderA.id})});
  assert.equal(own.status,200);const ownBody=await own.json();assert.equal(ownBody.order.orderId,orderA.id);
  assert(!JSON.stringify(ownBody).includes('"userId"'));assert(!JSON.stringify(ownBody).includes("passwordHash"));
  const foreign=await routeItemHandler.GET(request("/Api/Orders/"+orderB.id,{headers:{cookie:cookie("shiny_user_session",sessionA),"x-shiny-rate-id":"rate-a-item-00002"}}),{params:Promise.resolve({id:orderB.id})});
  assert.equal(foreign.status,404);assert.deepEqual(await foreign.json(),{error:"order_not_found"});
  const reverse=await routeItemHandler.GET(request("/Api/Orders/"+orderA.id,{headers:{cookie:cookie("shiny_user_session",sessionB),"x-shiny-rate-id":"rate-b-item-00001"}}),{params:Promise.resolve({id:orderA.id})});
  assert.equal(reverse.status,404);
  const invalid=await routeItemHandler.GET(request("/Api/Orders/bad.id!",{headers:{cookie:cookie("shiny_user_session",sessionA),"x-shiny-rate-id":"rate-a-item-00003"}}),{params:Promise.resolve({id:"bad.id!"})});
  assert.equal(invalid.status,400);
  const list=await routeListHandler.GET(request("/Api/Orders",{headers:{cookie:cookie("shiny_user_session",sessionA),"x-shiny-rate-id":"rate-a-list-00001"}}));
  assert.equal(list.status,200);const listBody=await list.json();assert.deepEqual(listBody.orders.map(x=>x.orderId),[orderA.id]);
  const ownerOnly=await routeListHandler.GET(request("/Api/Orders",{headers:{cookie:cookie("shiny_admin_session",owner),"x-shiny-rate-id":"rate-owner-list-01"}}));
  assert.equal(ownerOnly.status,401);
  const realNow=Date.now;Date.now=()=>realNow()+8*24*60*60_000;
  const expiredSession=await routeItemHandler.GET(request("/Api/Orders/"+orderA.id,{headers:{cookie:cookie("shiny_user_session",sessionA),"x-shiny-rate-id":"rate-expired-00001"}}),{params:Promise.resolve({id:orderA.id})});
  Date.now=realNow;assert.equal(expiredSession.status,401);
  assert.equal(security.deleteUserSession(sessionA),true);
  const revoked=await routeItemHandler.GET(request("/Api/Orders/"+orderA.id,{headers:{cookie:cookie("shiny_user_session",sessionA),"x-shiny-rate-id":"rate-revoked-0001"}}),{params:Promise.resolve({id:orderA.id})});
  assert.equal(revoked.status,401);
  console.log("AUTH/IDOR PASS: visitante 401; usuário A vê A; A/B e B/A 404; ID inválido 400; sessão expirada/revogada 401; OWNER não entra como usuário");
 
  assert.equal(orders.isValidOrderTransition("PENDING","PENDING"),true);
  for(const to of ["PAID","FAILED","CANCELLED","EXPIRED"])assert.equal(orders.isValidOrderTransition("PENDING",to),true);
  for(const from of ["PAID","FAILED","CANCELLED","EXPIRED"])for(const to of ["PAID","FAILED","CANCELLED","EXPIRED"])if(from!==to)assert.equal(orders.isValidOrderTransition(from,to),false);
  const cancelOrder=await mk("cancel-order","user-a");assert(cancelOrder);assert(await orders.updateOrder(cancelOrder.id,{status:"CANCELLED"}));await assert.rejects(()=>orders.updateOrder(cancelOrder.id,{status:"FAILED"}),/invalid_order_transition/);
  const expiredOrder=await mk("expired-order","user-a");assert(expiredOrder);assert(await orders.updateOrder(expiredOrder.id,{status:"EXPIRED"}));await assert.rejects(()=>orders.updateOrder(expiredOrder.id,{status:"CANCELLED"}),/invalid_order_transition/);
  const webhookOrder=await mk("webhook-order","user-a");assert(webhookOrder);await orders.associateTransaction(webhookOrder.id,{id:"tx-webhook",status:"pending",amount:1000,copyPaste:"pix",qrCodeBase64:"qr"});
  const approved=await orders.applyWebhookEvent({eventName:"payment.approved",transactionId:"tx-webhook",amount:1000,timestamp:now});
  assert.equal(approved.status,"PAID");assert.equal(approved.processed,true);
  const dup=await orders.applyWebhookEvent({eventName:"payment.approved",transactionId:"tx-webhook",amount:1000,timestamp:now});
  assert.equal(dup.processed,false);
  const downgrade=await orders.applyWebhookEvent({eventName:"payment.failed",transactionId:"tx-webhook",amount:1000,timestamp:now});
  assert.equal(downgrade.status,"PAID");assert.equal(downgrade.processed,false);
  console.log("STATES PASS: PENDING/PAID/FAILED/CANCELLED/EXPIRED, transições terminais bloqueadas, webhook duplicado idempotente");
 
  await orders.recordPendingWebhook({eventKey:"payment.approved:tx-early",eventName:"payment.approved",transactionId:"tx-early",amount:1000,timestamp:now,createdAt:now});
  assert((await orders.readPendingWebhooks()).some(x=>x.transactionId==="tx-early"));
  const earlyOrder=await mk("early-order","user-a");assert(earlyOrder);
  const earlyAssoc=await orders.associateTransaction(earlyOrder.id,{id:"tx-early",status:"pending",amount:1000,copyPaste:"pix",qrCodeBase64:"qr"});
  assert.equal(earlyAssoc.pendingApplied,true);assert.equal(earlyAssoc.order.status,"PAID");
  const badEarly=await mk("bad-early","user-a");assert(badEarly);
  const bad=await orders.applyWebhookEvent({eventName:"payment.approved",transactionId:badEarly.id,amount:999,timestamp:now});
  assert.equal(bad.processed,false);assert.equal(bad.reason,"unassociated");
  console.log("PENDING WEBHOOK PASS: evento precoce persistido e associado depois; divergência não processada");
  const sessionA2=security.createUserSession("user-a");
  const routeOrder=await mk("route-reconcile","user-a");assert(routeOrder);
  await orders.associateTransaction(routeOrder.id,{id:"tx-route",status:"pending",amount:1000,copyPaste:"pix",qrCodeBase64:"qr",expiresAt:new Date(Date.now()+15*60_000).toISOString()});
  const originalFetch=global.fetch;let providerCalls=0;
  global.fetch=async(url,options)=>{
    providerCalls++;
    assert.equal(String(url),"https://provider.test/transactions/tx-route");
    assert.equal(options.headers.Authorization,"fixture-not-secret");assert.notEqual(options.headers.Authorization,"Bearer fixture-not-secret");
    return new Response(JSON.stringify({id:"tx-route",status:"PAID",type:"DEPOSIT",amount:1000}),{status:200});
  };
  process.env["PROMISSE_API_BASE_URL"]="https://provider.test";process.env["PROMISSE_API_KEY"]="fixture-not-secret";
  const csrf=security.createCsrf();assert(csrf);
  const rec=await routeReconcileHandler.POST(request("/Api/Orders/"+routeOrder.id+"/Reconcile",{method:"POST",headers:{"cookie":cookie("shiny_user_session",sessionA2)+"; shiny_rl_id=rate-route-000001; shiny_csrf="+csrf,"x-csrf-token":csrf}}),{params:Promise.resolve({id:routeOrder.id})});
  assert.equal(rec.status,200);const recBody=await rec.json();assert.equal(recBody.order.status,"PAID");assert(providerCalls===1);
  global.fetch=originalFetch;
  const routeStored=await orders.findOrderById(routeOrder.id);assert.equal(routeStored.status,"PAID");assert.equal(routeStored.providerStatus,"PAID");
  const repeated=await reconciliation.reconcilePendingOrder(routeOrder.id,{fetchImpl:async()=>{throw new Error("must_not_call");}});
  assert.equal(repeated.kind,"unchanged");assert.equal(repeated.order.status,"PAID");
  console.log("ROUTE RECONCILIATION PASS: consulta server-side, Authorization crua, uma consulta manual, PAID persistido, repetição idempotente");
 
  const mkTx=async(key,tx)=>{
    const order=await mk(key,"user-a");assert(order);
    await orders.associateTransaction(order.id,{id:tx,status:"pending",amount:1000,copyPaste:"pix",qrCodeBase64:"qr"});
    return order;
  };
  async function lookup(order,mock,options={}){
    return reconciliation.reconcilePendingOrder(order.id,{...options,base:"https://provider.test",apiKey:"api-key-test",fetchImpl:mock});
  }
  const paidOrder=await mkTx("lookup-paid","tx-paid");
  let result=await lookup(paidOrder,async()=>new Response(JSON.stringify({id:"tx-paid",status:"PAID",type:"DEPOSIT",amount:1000}),{status:200}));
  assert.equal(result.kind,"paid");assert.equal((await orders.findOrderById(paidOrder.id)).status,"PAID");
  const pendingOrder=await mkTx("lookup-pending","tx-pending");
  result=await lookup(pendingOrder,async()=>new Response(JSON.stringify({id:"tx-pending",status:"pending",amount:1000}),{status:200}));
  assert.equal(result.kind,"pending");assert.equal((await orders.findOrderById(pendingOrder.id)).status,"PENDING");
  const invalidStatus=await mkTx("lookup-invalid","tx-invalid");
  result=await lookup(invalidStatus,async()=>new Response(JSON.stringify({id:"tx-invalid",amount:1000}),{status:200}));
  assert.equal(result.kind,"error");assert.equal((await orders.findOrderById(invalidStatus.id)).status,"PENDING");
  const wrongAmount=await mkTx("lookup-amount","tx-amount");
  result=await lookup(wrongAmount,async()=>new Response(JSON.stringify({id:"tx-amount",status:"PAID",type:"DEPOSIT",amount:999}),{status:200}));
  assert.equal(result.code,"provider_amount_mismatch");assert.equal((await orders.findOrderById(wrongAmount.id)).status,"PENDING");
  const wrongId=await mkTx("lookup-id","tx-id");
  result=await lookup(wrongId,async()=>new Response(JSON.stringify({id:"other-tx",status:"PAID",type:"DEPOSIT",amount:1000}),{status:200}));
  assert.equal(result.code,"provider_id_mismatch");
  const wrongType=await mkTx("lookup-type","tx-type");
  result=await lookup(wrongType,async()=>new Response(JSON.stringify({id:"tx-type",status:"PAID",type:"WITHDRAW",amount:1000}),{status:200}));
  assert.equal(result.code,"provider_type_invalid");
  const cases=[[401,"provider_auth_error"],[403,"provider_forbidden_scope"],[429,"provider_rate_limited"],[500,"provider_unavailable"]];
  for(const [httpStatus,code] of cases){
    const order=await mkTx("lookup-http-"+httpStatus,"tx-http-"+httpStatus);
    result=await lookup(order,async()=>new Response(JSON.stringify({error:"x"}),{status:httpStatus}));
    assert.equal(result.kind,"error");assert.equal(result.code,code);assert.equal((await orders.findOrderById(order.id)).status,"PENDING");
  }
  const network=await mkTx("lookup-network","tx-network");
  result=await lookup(network,async()=>{throw new Error("network");});
  assert.equal(result.code,"provider_timeout_or_network_error");assert.equal((await orders.findOrderById(network.id)).status,"PENDING");
  const slow=await mkTx("lookup-slow","tx-slow");
  result=await lookup(slow,async(_url,opts)=>new Promise((_resolve,reject)=>{
    opts.signal.addEventListener("abort",()=>reject(new Error("AbortError")));setTimeout(()=>{},100);
  }),{timeoutMs:25});
  assert.equal(result.code,"provider_timeout_or_network_error");assert.equal((await orders.findOrderById(slow.id)).status,"PENDING");
  console.log("PROMISSE MOCK PASS: PAID/pending/JSON inválido/valor/ID/tipo/401/403/429/500/network/timeout; erros não viram FAILED");
  const visualOrder=await mkTx("visual-expiry","tx-visual");
  await orders.updateOrder(visualOrder.id,{expiresAt:new Date(Date.now()-60_000).toISOString()});
  const visual=orderViews.toPublicOrder(await orders.findOrderById(visualOrder.id),new Date());
  assert.equal(visual.status,"PENDING");assert.equal(visual.isVisuallyExpired,true);assert.equal(visual.reconciliationRequired,true);assert.equal(visual.payment,undefined);
  console.log("EXPIRY UX PASS: expiresAt vencido não altera estado financeiro nem libera reserva/cupom; apenas sinaliza reconciliação");
 
  await fs.rm(path.join(temp,"Storage","orders.json"),{force:true});
  await fs.rm(path.join(temp,"Storage","promisse-pending-webhooks.json"),{force:true});
  await fs.writeFile(path.join(temp,"Storage","coupons.json"),"[]","utf8");
  const dashCoupon=await coupons.createCoupon({code:"DASH",type:"percent",value:10,usageLimit:5,minimumAmount:0,productIds:[],active:true});assert(dashCoupon);
  const dPending=await mk("dash-pending","user-a",{couponId:dashCoupon.id,discount:1,total:9});
  const dPaid=await mk("dash-paid","user-b");assert(dPaid);await orders.associateTransaction(dPaid.id,{id:"tx-dash-paid",status:"pending",amount:1000,copyPaste:"pix",qrCodeBase64:"qr"});await orders.applyWebhookEvent({eventName:"payment.approved",transactionId:"tx-dash-paid",amount:1000,timestamp:now});
  const dFailed=await mk("dash-failed","user-a");assert(dFailed);await orders.associateTransaction(dFailed.id,{id:"tx-dash-failed",status:"pending",amount:1000,copyPaste:"pix",qrCodeBase64:"qr"});await orders.applyWebhookEvent({eventName:"payment.failed",transactionId:"tx-dash-failed",amount:1000,timestamp:now});
  const dCancelled=await mk("dash-cancelled","user-a");assert(dCancelled);await orders.updateOrder(dCancelled.id,{status:"CANCELLED"});
  const dExpired=await mk("dash-expired","user-a");assert(dExpired);await orders.updateOrder(dExpired.id,{status:"EXPIRED"});
  assert(dPending);
  await orders.recordPendingWebhook({eventKey:"payment.approved:tx-unassociated",eventName:"payment.approved",transactionId:"tx-unassociated",amount:1000,timestamp:now,createdAt:now});
  await fs.mkdir(path.join(temp,"Logs"),{recursive:true});
  await fs.writeFile(path.join(temp,"Logs","audit.log"),[
    JSON.stringify({at:now,event:"payment_confirmed",ip:"127.0.0.1",details:{actor:"Sistema",resource:dPaid.id,result:"success"}}),
    JSON.stringify({at:now,event:"promisse_webhook_rejected",ip:"127.0.0.1",details:{actor:"Sistema",resource:"tx-rejected",result:"failure",reason:"amount_mismatch"}})
  ].join("\n")+"\n","utf8");
  const dashboard=await adminOrders.readAdminOrders();const m=dashboard.metrics;
  assert.equal(m.total,5);assert.equal(m.pending,1);assert.equal(m.paid,1);assert.equal(m.failed,1);assert.equal(m.cancelled,1);assert.equal(m.expired,1);assert.equal(m.revenue,10);
  assert.equal(m.ordersWithStockReservation,1);assert.equal(m.pendingStockUnits,1);assert.equal(m.ordersWithCouponReservation,1);
  assert.equal(m.unassociatedTransactions,1);assert.equal(m.reconciliationErrors,0);assert(m.lastValidWebhook);assert(m.lastRejectedWebhook);
  assert(!JSON.stringify(dashboard).includes('"userId"'));assert(!JSON.stringify(dashboard).includes("passwordHash"));assert(!JSON.stringify(dashboard).includes("api-key-test"));
  console.log("DASHBOARD PASS: mixed real fixtures; receita só PAID; reservas de estoque/cupom; evento sem associação; sem dados administrativos sensíveis");
 
  const pageSource=await source("app/page.tsx");const vaultSource=await source("app/Vault/VaultDashboard.tsx");
  assert(pageSource.includes("/Api/Orders/"));assert(pageSource.includes("Atualizar status"));assert(pageSource.includes("isVisuallyExpired"));assert(pageSource.includes("Pagamento confirmado"));assert(pageSource.includes("Pagamento falho"));assert(pageSource.includes("?order="));
  assert(!pageSource.includes("setCheckout(data);"));assert(vaultSource.includes("Reconciliar PENDING"));assert(vaultSource.includes("Receita reconhecida"));assert(vaultSource.includes("Cupom reservado"));assert(vaultSource.includes("orderMetrics"));
  assert(!pageSource.includes("PROMISSE_API_KEY"));assert(!vaultSource.includes("PROMISSE_API_KEY"));
  const paymentSource=await source("app/Api/Payment/[Id]/route.ts");assert(paymentSource.includes("validAdminOwnerSession"));assert(!paymentSource.includes("validUserSession"));
  const adminRoute=await source("app/Api/Admin/Orders/route.ts");assert(adminRoute.includes("validAdminOwnerSession"));assert(!adminRoute.includes("validUserSession"));
  console.log("UX/SECURITY STATIC PASS: reload por ?order=, atualização manual, estados; Payment/[Id] continua OWNER-only; dashboard sem secrets");
 
  console.log("ALL P2-A TESTS PASSED");
 }finally{
   process.chdir(project);
   Module._resolveFilename=originalResolve;
   await fs.rm(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
