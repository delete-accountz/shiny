import {readFile} from "node:fs/promises";
import path from "node:path";
import {readProducts,AdminProduct} from "@/Lib/ADMIN_STORE";
import {readAdminOrders} from "./ADMIN_ORDERS";
import {readUsers} from "./AUTH";
import {query} from "./DB";
import {reconciliationOperationalSnapshot} from "./RECONCILIATION";

export type {AdminProduct} from "@/Lib/ADMIN_STORE";
export type AdminCustomer={id:string;username:string;email:string;createdAt:string};
export type AdminLog={at:string;event:string;actor:string;resource:string;result:string;reason:string;ip:string};

type StoredUser={id?:unknown;username?:unknown;email?:unknown;passwordHash?:unknown;createdAt?:unknown};
type StoredLog={at?:unknown;event?:unknown;ip?:unknown;details?:unknown};
const databaseMode=()=>process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true";

function decodeText(buffer:Buffer){
  if(buffer.length>=2&&buffer[0]===0xff&&buffer[1]===0xfe)return new TextDecoder("utf-16le").decode(buffer.subarray(2));
  if(buffer.length>=2&&buffer[0]===0xfe&&buffer[1]===0xff)return new TextDecoder("utf-16be").decode(buffer.subarray(2));
  const text=new TextDecoder("utf-8",{fatal:false}).decode(buffer);
  if(text.includes("\u0000"))return new TextDecoder("utf-16le").decode(buffer);
  return text;
}

async function readCustomers():Promise<AdminCustomer[]>{
  if(databaseMode())return (await readUsers()).map(user=>({id:user.id,username:user.username,email:user.email,createdAt:user.createdAt}));
  try{
    const raw=await readFile(path.join(process.cwd(),"Storage","users.json"));
    const parsed=JSON.parse(decodeText(raw)) as unknown;
    if(!Array.isArray(parsed))return [];
    return parsed.map(item=>{
      const user=item as StoredUser;
      return typeof user.id==="string"&&typeof user.username==="string"&&typeof user.email==="string"&&typeof user.createdAt==="string"
        ?{id:user.id,username:user.username,email:user.email,createdAt:user.createdAt}
        :null;
    }).filter((item):item is AdminCustomer=>item!==null);
  }catch{return [];}
}

function parseLogLine(line:string):AdminLog|null{
  const trimmed=line.trim().replace(/^\uFEFF/,"");
  if(!trimmed)return null;
  let parsed:StoredLog|null=null;
  try{parsed=JSON.parse(trimmed) as StoredLog;}catch{
    const start=trimmed.indexOf("{");
    const end=trimmed.lastIndexOf("}");
    if(start<0||end<=start)return null;
    try{parsed=JSON.parse(trimmed.slice(start,end+1)) as StoredLog;}catch{return null;}
  }
  if(typeof parsed.at!=="string"||typeof parsed.event!=="string")return null;
  const details=parsed.details&&typeof parsed.details==="object"&&!Array.isArray(parsed.details)?parsed.details as Record<string,unknown>:{};
  const actor=typeof details.actor==="string"&&details.actor.trim()?details.actor.trim():typeof details.user==="string"&&details.user.trim()?details.user.trim():"Sistema";
  const resource=typeof details.resource==="string"?details.resource:"";
  const result=typeof details.result==="string"?details.result:parsed.event.includes("failed")||parsed.event.includes("rejected")||parsed.event.includes("rate_limited")?"failure":"success";
  const reason=typeof details.reason==="string"?details.reason:"";
  const ip=typeof parsed.ip==="string"?parsed.ip:"unknown";
  return {at:parsed.at,event:parsed.event,actor,resource,result,reason,ip};
}

async function readLogs(limit=100):Promise<AdminLog[]>{
  if(databaseMode()){
    const rows=await query<{at:string;event:string;actor:string|null;resource:string|null;result:string|null;reason:string|null}>(`SELECT created_at AS at,event,COALESCE(actor_id::text,'Sistema') AS actor,resource_id AS resource,result,details->>'reason' AS reason FROM audit_events ORDER BY created_at DESC LIMIT $1`,[Math.max(1,Math.min(limit,5000))]);
    return rows.map(row=>({at:row.at,event:row.event,actor:row.actor||"Sistema",resource:row.resource||"",result:row.result||"",reason:row.reason||"",ip:"database"}));
  }
  try{
    const raw=await readFile(path.join(process.cwd(),"Logs","audit.log"));
    const text=decodeText(raw);
    const chunks=text.split(/(?:\r?\n|\\n)+/).map(line=>line.trim()).filter(Boolean);
    return chunks.map(parseLogLine).filter((item):item is AdminLog=>item!==null).slice(-limit).reverse();
  }catch{return [];}
}
export async function readAdminLogs(limit=5000){return readLogs(Math.max(1,Math.min(limit,5000)));}

export async function readAdminData(){
  const [products,customers,logs,orderData,reconciliation]=await Promise.all([readProducts(),readCustomers(),readLogs(),readAdminOrders(),reconciliationOperationalSnapshot()]);
  return {
    products,
    customers,
    logs,
    orders:orderData.orders,
    orderMetrics:orderData.metrics,
    reconciliation,
    hcaptchaConfigured:Boolean(process.env.HCAPTCHA_SECRET_KEY?.trim()&&process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim()),
    paymentsConfigured:Boolean(process.env.PROMISSE_API_BASE_URL?.trim()&&process.env.PROMISSE_API_KEY?.trim()),
    promiseBaseConfigured:Boolean(process.env.PROMISSE_API_BASE_URL?.trim()),
    promiseApiKeyConfigured:Boolean(process.env.PROMISSE_API_KEY?.trim()),
    promiseWebhookConfigured:Boolean(process.env.PROMISSE_WEBHOOK_URL?.trim()),
    promiseWebhookSecretConfigured:Boolean(process.env.PROMISSE_WEBHOOK_SECRET?.trim()),
    promiseMode:(process.env.PROMISSE_API_BASE_URL?.trim()&&process.env.PROMISSE_API_KEY?.trim()?"production":"incomplete") as "production"|"incomplete",
    promiseSandboxDocumented:false,
    promiseLastError:logs.find(log=>/checkout_payment_failed|payment_lookup_failed|promisse_webhook_failed|promisse_webhook_rejected/i.test(log.event))||null,
    promiseLastReconciliationAt:orderData.metrics.lastReconciliationAt
  };
}
