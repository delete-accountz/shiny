import {appendFile,mkdir,readdir,rename,stat,unlink} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {clientKey} from "./SECURITY";
import {auditDb} from "./DB/AUDIT";

const maxLogBytes=5*1024*1024;
const maxArchives=10;
let chain:Promise<void>=Promise.resolve();

function safe(value:unknown){return String(value).replace(/[\r\n\t]+/g," ").slice(0,500);}
function filteredDetails(details:Record<string,string|number|boolean>){
  return Object.fromEntries(Object.entries(details)
    .filter(([key])=>!/(key|token|secret|password|hash|authorization|cookie|session|payload|signature)/i.test(key))
    .map(([key,value])=>[safe(key),safe(value)]));
}
async function rotateIfNeeded(file:string,dir:string){
  try{
    const info=await stat(file);
    if(info.size<maxLogBytes)return;
  }catch{return;}
  await mkdir(dir,{recursive:true});
  const archived=path.join(dir,"audit-"+new Date().toISOString().replace(/[:.]/g,"-")+"-"+randomUUID()+".jsonl");
  try{await rename(file,archived);}catch{return;}
  const names=(await readdir(dir)).filter(name=>name.endsWith(".jsonl")).sort().reverse();
  for(const name of names.slice(maxArchives))await unlink(path.join(dir,name)).catch(()=>{});
}
async function appendBounded(file:string,line:string){
  const dir=path.dirname(file);const archive=path.join(dir,"audit-archive");
  await mkdir(dir,{recursive:true});
  await rotateIfNeeded(file,archive);
  await appendFile(file,line,{encoding:"utf8"});
}
async function write(event:string,request:Request,details:Record<string,string|number|boolean>,failure=false){
  const ip=safe(clientKey(request));
  const filtered=filteredDetails(details);
  const record:Record<string,unknown>={at:new Date().toISOString(),event:safe(failure?"audit_failure":event),ip,details:filtered};
  if(failure)record.failedEvent=safe(event);
  const line=JSON.stringify(record)+"\n";
  const file=path.join(process.cwd(),"Logs",failure?"audit-failures.log":"audit.log");
  await appendBounded(file,line);
}
export async function audit(event:string,request:Request,details:Record<string,string|number|boolean>={}){
  if(process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true")return auditDb(event,request,details,false);
  const previous=chain;let release!:()=>void;chain=new Promise(resolve=>{release=resolve});await previous;
  try{await write(event,request,details,false);}finally{release();}
}
export async function auditFailure(event:string,request:Request,details:Record<string,string|number|boolean>={}){
  if(process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true")return auditDb(event,request,details,true).catch(()=>{});
  const previous=chain;let release!:()=>void;chain=new Promise(resolve=>{release=resolve});await previous;
  try{await write(event,request,details,true);}catch{}finally{release();}
}
