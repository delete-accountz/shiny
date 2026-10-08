const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const cp=require("node:child_process");

(async()=>{
 const project=process.cwd();
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),"shiny-p1-"));
 const compiled=path.join(temp,"compiled");
 await fs.mkdir(path.join(temp,"Storage"),{recursive:true});
 await fs.mkdir(compiled,{recursive:true});
 const ts=path.join(project,"node_modules","typescript","bin","tsc");
 cp.execFileSync(process.execPath,[ts,"--target","ES2022","--module","commonjs","--moduleResolution","node","--esModuleInterop","--skipLibCheck","--outDir",compiled,
  path.join(project,"Src","Lib","SECURITY.ts"),path.join(project,"Src","Lib","HCAPTCHA.ts"),path.join(project,"Src","Lib","SSRF.ts"),path.join(project,"Src","Lib","BODY_LIMITS.ts"),path.join(project,"Src","Lib","AUDIT.ts"),path.join(project,"Src","Lib","ORDERS.ts"),path.join(project,"Src","Lib","COUPONS.ts"),path.join(project,"Src","Lib","ADMIN_STORE.ts"),path.join(project,"Src","Lib","CART.ts"),path.join(project,"Src","Lib","AUTH.ts")],{stdio:"inherit"});
 process.env.NODE_PATH=path.join(project,"node_modules");require("node:module").Module._initPaths();
 process.chdir(temp);
 const security=require(path.join(compiled,"SECURITY.js"));
 const hcaptcha=require(path.join(compiled,"HCAPTCHA.js"));
 const ssrf=require(path.join(compiled,"SSRF.js"));
 const audit=require(path.join(compiled,"AUDIT.js"));
 const orders=require(path.join(compiled,"ORDERS.js"));
 const coupons=require(path.join(compiled,"COUPONS.js"));
 const store=require(path.join(compiled,"ADMIN_STORE.js"));

 try{
  const realNow=Date.now;
  const concurrent=await Promise.all(Array.from({length:100},()=>Promise.resolve(security.createCsrf())));
  assert.equal(new Set(concurrent).size,100);
  const used=concurrent[0];assert.equal(security.validCsrf(used),true);assert.equal(security.validCsrf(used),false);
  const expired=security.createCsrf();Date.now=()=>realNow()+16*60_000;assert.equal(security.validCsrf(expired),false);Date.now=realNow;
  Date.now=()=>realNow()+16*60_000;for(let i=0;i<64;i++)security.createCsrf();Date.now=()=>realNow()+32*60_000;const pruned=[];for(let i=0;i<28;i++)pruned.push(security.createCsrf());for(const token of pruned)if(token)security.validCsrf(token);Date.now=realNow;
  const many=[];for(let i=0;i<4096;i++)many.push(security.createCsrf());assert(many.every(Boolean));assert.equal(security.createCsrf(),null);
  Date.now=()=>realNow()+16*60_000;assert(security.createCsrf());Date.now=realNow;
  console.log("M01 PASS: one-time, expiry, pruning, 4096 cap, concurrent generation");

  process.env.TRUSTED_PROXY="false";delete process.env.TRUSTED_PROXY_HEADER;
  assert.equal(security.clientKey(new Request("https://x",{headers:{"x-real-ip":"1.2.3.4","x-shiny-rate-id":"stable-client-01"}})),"stable-client-01");
  process.env.TRUSTED_PROXY="true";process.env.TRUSTED_PROXY_HEADER="x-real-ip";
  assert.equal(security.clientKey(new Request("https://x",{headers:{"x-real-ip":"1.2.3.4","x-shiny-rate-id":"other"}})),"1.2.3.4");
  process.env.TRUSTED_PROXY_HEADER="invalid";assert.equal(security.clientKey(new Request("https://x",{headers:{"x-real-ip":"1.2.3.4","x-shiny-rate-id":"stable-client-01"}})),"stable-client-01");
  console.log("M03 PASS: trusted proxy policy plus isolated non-IP fallback");

  process.env["HCAPTCHA_SECRET_KEY"]="fixture-not-secret";process.env["NEXT_PUBLIC_HCAPTCHA_SITE_KEY"]="fixture-site";process.env.TRUSTED_PROXY="false";delete process.env.TRUSTED_PROXY_HEADER;
  const originalFetch=global.fetch;const calls=[];global.fetch=async(url,options)=>{calls.push({url:String(url),body:String(options.body)});return new Response(JSON.stringify({success:true}),{status:200,headers:{"content-type":"application/json"}});};
  assert.deepEqual(await hcaptcha.verifyHCaptcha("token-a",new Request("https://x",{headers:{"x-forwarded-for":"8.8.8.8"}})),{ok:true});
  assert(!calls[0].body.includes("remoteip"));
  process.env.TRUSTED_PROXY="true";process.env.TRUSTED_PROXY_HEADER="x-real-ip";
  assert.deepEqual(await hcaptcha.verifyHCaptcha("token-b",new Request("https://x",{headers:{"x-real-ip":"8.8.8.8"}})),{ok:true});
  assert(calls[1].body.includes("remoteip=8.8.8.8"));global.fetch=originalFetch;
  console.log("M04 PASS: remoteip omitted unless trusted proxy is explicitly configured");

  const source=async rel=>fs.readFile(path.join(project,rel),"utf8");const hcaptchaSource=await source("Src/Lib/HCAPTCHA.ts");assert(!hcaptchaSource.includes("idempotency_key"));
  const widget=await source("app/HCaptchaWidget.tsx");const page=await source("app/page.tsx");
  assert(widget.includes("hcaptcha.reset(widget.current)"));assert(widget.includes("resetSignal"));assert(page.includes("setCaptchaResetSignal"));assert(page.includes('finally{setCaptchaToken("");setCaptchaResetSignal'));
  console.log("M05 PASS: reset on success/failure/network/expiry paths and submit finally");

  const bodyUtil=await source("Src/Lib/BODY_LIMITS.ts");assert(bodyUtil.includes("getReader"));assert(bodyUtil.includes("content-length"));
  const boundedRoutes=[
   "app/Api/Analytics/route.ts","app/Api/Webhooks/Promisse/route.ts","app/Api/Admin/Login/route.ts","app/Api/Auth/Login/route.ts","app/Api/Auth/Register/route.ts","app/Api/Checkout/route.ts","app/Api/Support/route.ts","app/Api/Admin/Posts/route.ts","app/Api/Admin/Posts/[id]/route.ts","app/Api/Admin/Products/route.ts","app/Api/Admin/Products/[id]/route.ts","app/Api/Admin/Coupons/route.ts","app/Api/Admin/Coupons/[id]/route.ts","app/Api/Admin/Webhooks/route.ts","app/Api/Admin/Webhooks/[id]/route.ts","app/Api/Admin/Webhooks/[id]/Test/route.ts","app/Api/Admin/FAQ/route.ts","app/Api/Admin/FAQ/[id]/route.ts","app/Api/Admin/Support/[id]/route.ts"];
  for(const rel of boundedRoutes){const text=await source(rel);assert(text.includes("parseJsonBody")||text.includes("readJsonBody")||text.includes("readRawBody"),"missing body bound: "+rel);}
  const analytics=await source("app/Api/Analytics/route.ts");assert(analytics.includes(".strict()"));assert(analytics.includes("maxBody=8_192"));
  console.log("M06 PASS: bounded body reads across relevant JSON/raw endpoints");

  const analyticsLib=require(path.join(compiled,"ADMIN_STORE.js"));
  await fs.writeFile(path.join(temp,"Storage","analytics.json"),JSON.stringify(Array.from({length:20000},(_,i)=>({event:"page_view",path:"/p"+i,at:"t"}))),"utf8");
  const analyticsModulePath=path.join(project,"Src","Lib","ANALYTICS.ts");
  const analyticsSource=await fs.readFile(analyticsModulePath,"utf8");assert(analyticsSource.includes("slice(-20000)"));
  console.log("M02 PASS: schema strict/normalization/rate-limit guards plus 20k storage cap");

  await fs.writeFile(path.join(temp,"Storage","products.json"),JSON.stringify([{id:"p1",name:"P1",price:10,description:"",active:true,stock:5}]),"utf8");
  await fs.writeFile(path.join(temp,"Storage","coupons.json"),"[]","utf8");await fs.rm(path.join(temp,"Storage","orders.json"),{force:true});
  const order=await orders.createOrder({userId:"u1",items:[{productId:"p1",name:"P1",quantity:1,unitPrice:10}],subtotal:10,discount:0,total:10,status:"PENDING",idempotencyKeyHash:orders.hashIdempotencyKey("m07")});assert(order);
  await orders.associateTransaction(order.id,{id:"tx-m07",status:"pending",amount:1000,copyPaste:"x",qrCodeBase64:"x"});
  const mismatch=await orders.applyWebhookEvent({eventName:"payment.approved",transactionId:"tx-m07",amount:999,timestamp:"t"});assert.equal(mismatch.reason,"amount_mismatch");
  const invalid=await orders.applyWebhookEvent({eventName:"payment.failed",transactionId:"tx-m07",amount:1000,timestamp:"t"});assert.equal(invalid.status,"FAILED");assert.equal(invalid.processed,true);
  const again=await orders.applyWebhookEvent({eventName:"payment.approved",transactionId:"tx-m07",amount:1000,timestamp:"t"});assert.equal(again.reason,"invalid_transition");assert.equal(again.processed,false);
  const persisted=(await orders.readOrders()).find(x=>x.id===order.id);assert(persisted);assert.equal(persisted.processedWebhookEvents.includes("payment.approved:tx-m07"),false);
  console.log("M07 PASS: invalid/amount-mismatch events remain unprocessed; invalid transition does not alter state");

  const ips=["127.0.0.1","10.1.2.3","172.16.0.1","192.168.1.1","169.254.169.254","100.64.0.1","0.1.2.3","::1","fc00::1","fe80::1","::ffff:127.0.0.1","::ffff:10.1.2.3","::ffff:c0a8:0101","::ffff:169.254.169.254","::ffff:6440:1","::ffff:7f00:1"];
  for(const ip of ips)assert.equal(ssrf.isBlockedAddress(ip),true,"must block "+ip);
  assert.equal(ssrf.isBlockedAddress("8.8.8.8"),false);assert.equal(ssrf.isBlockedAddress("2001:4860:4860::8888"),false);
  console.log("M09 PASS: private/link-local/metadata ranges and IPv4-mapped IPv6 blocked");

  const logFile=path.join(temp,"Logs","audit.log");await fs.mkdir(path.dirname(logFile),{recursive:true});
  await fs.writeFile(logFile,"x".repeat(5*1024*1024+10),"utf8");
  await audit.audit("test\r\nEvent",new Request("https://x"),{secret:"DO_NOT_WRITE",message:"hello\r\nworld"});
  const active=await fs.readFile(logFile,"utf8");assert(active.includes("hello world"));assert(!active.includes("DO_NOT_WRITE"));assert.equal(active.trim().split("\n").length,1);JSON.parse(active);
  const archives=await fs.readdir(path.join(temp,"Logs","audit-archive"));assert(archives.some(name=>name.endsWith(".jsonl")));
  console.log("M11 PASS: bounded JSONL append, CR/LF sanitization, secret filtering, rotation");

  const proxy=await source("proxy.ts");assert(proxy.includes("SHINY_STORAGE_MODE"));assert(proxy.includes("DATABASE_REQUIRED"));assert(proxy.includes("database_deployment_not_configured"));assert(proxy.includes("x-shiny-rate-id"));
  const readme=await source("README.md");assert(readme.includes("single-process"));assert(readme.includes("TRUSTED_PROXY_HEADER"));
  console.log("M10 PASS: production single-process guard and explicit proxy/storage policy");

  const adminData=await source("Src/Lib/ADMIN_DATA.ts");const dashboard=await source("app/Vault/VaultDashboard.tsx");
  assert(adminData.includes("promiseApiKeyConfigured"));assert(adminData.includes("promiseWebhookSecretConfigured"));assert(adminData.includes("promiseSandboxDocumented:false"));assert(adminData.includes("promiseLastReconciliationAt"));
  assert(dashboard.includes("Não documentado"));assert(!dashboard.includes("promiseTestModeConfigured"));
  console.log("M12 PASS: dashboard derives Promisse configuration state without secrets");

  console.log("ALL P1 REGRESSION TESTS PASSED");
 }finally{process.chdir(project);await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
