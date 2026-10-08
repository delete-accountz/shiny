import {mkdir,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import * as dbAnalytics from "./DB/ANALYTICS";
const databaseMode=()=>process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true";
export type AnalyticsEvent="page_view"|"product_view"|"checkout_start";
type Event={id:string;event:AnalyticsEvent;path:string;at:string};
const file=path.join(process.cwd(),"Storage","analytics.json");let chain:Promise<void>=Promise.resolve();
async function readStored():Promise<Event[]>{try{return JSON.parse(await readFile(file,"utf8")) as Event[];}catch(error){const code=error&&typeof error==="object"&&"code" in error?(error as {code?:string}).code:undefined;if(code==="ENOENT")return [];throw error;}}
async function persist(events:Event[]){await mkdir(path.dirname(file),{recursive:true});const tmp=file+"."+randomUUID()+".tmp";await writeFile(tmp,JSON.stringify(events.slice(-20000),null,2)+"\n","utf8");await rename(tmp,file);}
async function lock<T>(op:()=>Promise<T>){const previous=chain;let release!:()=>void;chain=new Promise(resolve=>{release=resolve});await previous;try{return await op();}finally{release();}}
export async function trackAnalyticsEvent(event:AnalyticsEvent,pathName:string){if(databaseMode())return dbAnalytics.trackAnalyticsEvent(event,pathName);return lock(async()=>{const events=await readStored();events.push({id:randomUUID(),event,path:pathName.slice(0,200),at:new Date().toISOString()});await persist(events);});}
export async function analyticsSummary(days=30){if(databaseMode())return dbAnalytics.analyticsSummary(days);const since=Date.now()-days*86_400_000;const events=(await readStored()).filter(item=>Date.parse(item.at)>=since);const byEvent=Object.fromEntries((["page_view","product_view","checkout_start"] as AnalyticsEvent[]).map(event=>[event,events.filter(item=>item.event===event).length]));const pages=new Map<string,number>();for(const item of events.filter(item=>item.event==="page_view"))pages.set(item.path,(pages.get(item.path)||0)+1);const topPages=[...pages.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([path,count])=>({path,count}));return {days,total:events.length,byEvent,topPages};}
