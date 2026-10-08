import {mkdir,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,randomUUID} from "node:crypto";
import {audit} from "@/Lib/AUDIT";
import {lookup} from "node:dns/promises";
import {isIP} from "node:net";
import http from "node:http";
import https from "node:https";
import {isBlockedAddress} from "./SSRF";
import * as dbWebhooks from "./DB/WEBHOOKS";
const databaseMode=()=>process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true";

export const webhookEvents=["order.created","payment.confirmed","customer.created","product.out_of_stock","post.created","ticket.created"] as const;
export type WebhookEvent=typeof webhookEvents[number];
export type Webhook={id:string;name:string;url:string;method:"POST"|"PUT"|"PATCH";events:WebhookEvent[];active:boolean;secretConfigured:boolean;headers:string[];createdAt:string;updatedAt:string};
type StoredWebhook=Omit<Webhook,"secretConfigured"|"headers">&{secret:string;headers:Record<string,string>};
export type Delivery={id:string;webhookId:string;event:WebhookEvent;status:"success"|"failed";statusCode?:number;durationMs:number;attempts:number;error?:string;at:string};
type Input={name:string;url:string;method:"POST"|"PUT"|"PATCH";events:WebhookEvent[];active:boolean;secret:string;headers:Record<string,string>};

const webhookPath=path.join(process.cwd(),"Storage","webhooks.json");
const deliveryPath=path.join(process.cwd(),"Storage","webhook-deliveries.json");
let chain:Promise<void>=Promise.resolve();

function storageKey(){
  const secret=(process.env.ADMIN_ACCESS_KEY||"").trim();
  if(!secret)throw new Error("admin_secret_missing");
  return createHash("sha256").update(secret).digest();
}
function encrypt(value:string){
  const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",storageKey(),iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
function decrypt(value:string){
  const [ivText,tagText,dataText]=value.split(".");
  if(!ivText||!tagText||!dataText)throw new Error("encrypted_value_invalid");
  const decipher=createDecipheriv("aes-256-gcm",storageKey(),Buffer.from(ivText,"base64url"));
  decipher.setAuthTag(Buffer.from(tagText,"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataText,"base64url")),decipher.final()]).toString("utf8");
}
async function readStored():Promise<StoredWebhook[]>{
  try{return JSON.parse(await readFile(webhookPath,"utf8")) as StoredWebhook[];}
  catch(error){const code=error&&typeof error==="object"&&"code" in error?(error as {code?:string}).code:undefined;if(code==="ENOENT")return [];throw error;}
}
async function persist(items:StoredWebhook[]){
  await mkdir(path.dirname(webhookPath),{recursive:true});const tmp=webhookPath+"."+randomUUID()+".tmp";
  await writeFile(tmp,JSON.stringify(items,null,2)+"\n","utf8");await rename(tmp,webhookPath);
}
async function readDeliveries():Promise<Delivery[]>{
  try{return JSON.parse(await readFile(deliveryPath,"utf8")) as Delivery[];}
  catch(error){const code=error&&typeof error==="object"&&"code" in error?(error as {code?:string}).code:undefined;if(code==="ENOENT")return [];throw error;}
}
async function persistDeliveries(items:Delivery[]){
  await mkdir(path.dirname(deliveryPath),{recursive:true});const tmp=deliveryPath+"."+randomUUID()+".tmp";
  await writeFile(tmp,JSON.stringify(items.slice(-500),null,2)+"\n","utf8");await rename(tmp,deliveryPath);
}
async function lock<T>(operation:()=>Promise<T>):Promise<T>{
  const previous=chain;let release!:()=>void;chain=new Promise(resolve=>{release=resolve});await previous;try{return await operation();}finally{release();}
}
function publicWebhook(item:StoredWebhook):Webhook{
  return {...item,secretConfigured:Boolean(item.secret),headers:Object.keys(item.headers)};
}
export async function readWebhooks(){return databaseMode()?dbWebhooks.readWebhooks():(await readStored()).map(publicWebhook);}
export async function getStoredWebhook(id:string){return databaseMode()?await dbWebhooks.getStoredWebhook(id):(await readStored()).find(item=>item.id===id)||null;}
export async function createWebhook(input:Input){
  if(databaseMode())return dbWebhooks.createWebhook(input);
  return lock(async()=>{const items=await readStored();const now=new Date().toISOString();const item:StoredWebhook={id:randomUUID(),name:input.name,url:input.url,method:input.method,events:input.events,active:input.active,secret:encrypt(input.secret),headers:Object.fromEntries(Object.entries(input.headers).map(([key,value])=>[key,encrypt(value)])),createdAt:now,updatedAt:now};await persist([...items,item]);return publicWebhook(item);});
}
export async function updateWebhook(id:string,input:Input){
  if(databaseMode())return dbWebhooks.updateWebhook(id,input);
  return lock(async()=>{const items=await readStored();const index=items.findIndex(item=>item.id===id);if(index<0)return null;const current=items[index];const item:StoredWebhook={...current,...input,id,secret:input.secret?encrypt(input.secret):current.secret,headers:Object.fromEntries(Object.entries(input.headers).map(([key,value])=>[key,encrypt(value)])),updatedAt:new Date().toISOString()};const next=[...items];next[index]=item;await persist(next);return publicWebhook(item);});
}
export async function deleteWebhook(id:string){if(databaseMode())return dbWebhooks.deleteWebhook(id);return lock(async()=>{const items=await readStored();if(!items.some(item=>item.id===id))return false;await persist(items.filter(item=>item.id!==id));return true;});}
export async function readWebhookDeliveries(webhookId?:string){if(databaseMode())return dbWebhooks.readWebhookDeliveries(webhookId);const items=await readDeliveries();return webhookId?items.filter(item=>item.webhookId===webhookId).reverse():items.reverse();}
const privateIp=isBlockedAddress;
export async function validateWebhookUrl(raw:string){
  let url:URL;try{url=new URL(raw);}catch{return "invalid_url";}
  if(url.protocol!=="https:")return "https_required";
  if(url.username||url.password)return "credentials_not_allowed";
  const host=url.hostname.toLowerCase();
  if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host==="metadata.google.internal")return "private_host";
  if(isIP(host))return privateIp(host)?"private_host":null;
  const addresses=await lookup(host,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(item=>privateIp(item.address)))return "private_host";
  return null;
}
function requestOnce(item:StoredWebhook,payload:string,signature:string):Promise<{statusCode:number;durationMs:number;error?:string}>{
  return new Promise(async resolve=>{
    const started=Date.now();let url:URL;
    try{url=new URL(item.url);}catch{return resolve({statusCode:0,durationMs:0,error:"invalid_url"});}
    let addresses;try{addresses=await lookup(url.hostname,{all:true,verbatim:true});}catch{return resolve({statusCode:0,durationMs:Date.now()-started,error:"dns_failed"});}
    const publicAddress=addresses.find(address=>!privateIp(address.address));
    if(!publicAddress)return resolve({statusCode:0,durationMs:Date.now()-started,error:"private_host"});
    const headers:Record<string,string>={"content-type":"application/json","x-shiny-signature":signature,"user-agent":"Shiny-Webhooks/1.0"};
    for(const [key,value] of Object.entries(item.headers)){try{headers[key]=decrypt(value);}catch{return resolve({statusCode:0,durationMs:Date.now()-started,error:"header_decrypt_failed"});}}
    const transport=url.protocol==="https:"?https:http;
    let settled=false;
    const finish=(value:{statusCode:number;durationMs:number;error?:string})=>{if(settled)return;settled=true;resolve(value);};
    const req=transport.request({hostname:url.hostname,port:url.port||443,path:url.pathname+url.search,method:item.method,headers,servername:url.hostname,timeout:8000,lookup:(_hostname,_options,callback)=>callback(null,publicAddress.address,publicAddress.family)},response=>{
      let size=0;
      response.on("data",chunk=>{size+=Buffer.byteLength(chunk);if(size>64*1024){response.destroy();finish({statusCode:response.statusCode||0,durationMs:Date.now()-started,error:"response_too_large"});}});
      response.on("end",()=>finish({statusCode:response.statusCode||0,durationMs:Date.now()-started,error:response.statusCode&&response.statusCode>=200&&response.statusCode<300?undefined:"http_error"}));
      response.on("error",()=>finish({statusCode:response.statusCode||0,durationMs:Date.now()-started,error:"response_error"}));
      response.on("close",()=>finish({statusCode:response.statusCode||0,durationMs:Date.now()-started,error:"response_closed"}));
    });
    req.on("timeout",()=>req.destroy(new Error("timeout")));req.on("error",error=>finish({statusCode:0,durationMs:Date.now()-started,error:error.message.slice(0,120)}));req.write(payload);req.end();
  });
}
export async function sendWebhookTest(id:string,event:WebhookEvent){
  const item=await getStoredWebhook(id) as StoredWebhook|null;if(!item)return null;
  let secret="";try{secret=decrypt(item.secret);}catch{secret="";}
  const body=JSON.stringify({event,at:new Date().toISOString(),data:{test:true}});
  const signature=secret?createHmac("sha256",secret).update(body).digest("hex"):"";
  const result=await requestOnce(item,body,signature);
  const delivery:Delivery={id:randomUUID(),webhookId:item.id,event,status:result.error?"failed":"success",statusCode:result.statusCode||undefined,durationMs:result.durationMs,attempts:1,error:result.error,at:new Date().toISOString()};
  if(databaseMode())await dbWebhooks.recordDelivery(delivery);else await lock(async()=>persistDeliveries([...(await readDeliveries()),delivery]));
  return delivery;
}
export async function dispatchWebhookEvent(event:WebhookEvent,payload:Record<string,unknown>,request?:Request){
  const items=databaseMode()?await Promise.all((await dbWebhooks.readWebhooks()).map(async item=>(await dbWebhooks.getStoredWebhook(item.id)) as StoredWebhook|null)).then(items=>items.filter((item):item is StoredWebhook=>Boolean(item))):await readStored();
  const targets=items.filter(item=>item.active&&item.events.includes(event));
  await Promise.all(targets.map(async item=>{
    let secret="";try{secret=decrypt(item.secret);}catch{secret="";}
    const body=JSON.stringify({event,at:new Date().toISOString(),data:payload});
    const signature=secret?createHmac("sha256",secret).update(body).digest("hex"):"";
    let result:{statusCode:number;durationMs:number;error?:string}={statusCode:0,durationMs:0,error:"not_attempted"};
    let attempts=0;
    for(let attempt=1;attempt<=3;attempt++){attempts=attempt;result=await requestOnce(item,body,signature);if(!result.error)break;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,Math.min(2000,250*2**(attempt-1))));}
    const delivery:Delivery={id:randomUUID(),webhookId:item.id,event,status:result.error?"failed":"success",statusCode:result.statusCode||undefined,durationMs:result.durationMs,attempts,error:result.error,at:new Date().toISOString()};
    if(databaseMode())await dbWebhooks.recordDelivery(delivery);else await lock(async()=>persistDeliveries([...(await readDeliveries()),delivery]));
    if(request)await audit("webhook_delivered",request,{actor:"system",resource:item.id,result:delivery.status,event,statusCode:delivery.statusCode||0,durationMs:delivery.durationMs,attempts:delivery.attempts,reason:delivery.error||""});
  }));
}
