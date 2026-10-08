import {createHmac,randomBytes,randomUUID,timingSafeEqual} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from "node:fs";
import path from "node:path";
import * as dbSecurity from "./DB/SECURITY";

const attempts=new Map<string,number>();
const authWindows=new Map<string,{count:number;reset:number}>();
const csrfTokens=new Map<string,number>();
const csrfTokenLimit=4096;
let csrfCreateCounter=0;
const adminSessionLifetime=60*60_000;
const revokedSessionsPath=path.join(process.cwd(),"Storage",".revoked-sessions.json");
let revokedLoaded=false;
const revokedSessions=new Map<string,number>();
const databaseMode=()=>process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true";

function loadRevokedSessions(){
  if(revokedLoaded)return;
  revokedLoaded=true;
  try{
    const raw=JSON.parse(readFileSync(revokedSessionsPath,"utf8")) as unknown;
    if(!Array.isArray(raw))return;
    const now=Date.now();
    for(const item of raw){
      if(item&&typeof item==="object"){
        const value=item as {hash?:unknown;expires?:unknown};
        if(typeof value.hash==="string"&&typeof value.expires==="number"&&value.expires>now)revokedSessions.set(value.hash,value.expires);
      }
    }
  }catch{}
}

function sessionHash(token:string){
  return createHmac("sha256","shiny-session-revocation").update(token).digest("hex");
}

function sessionRevoked(token:string){
  loadRevokedSessions();
  const hash=sessionHash(token);
  const expires=revokedSessions.get(hash);
  if(!expires)return false;
  if(expires<=Date.now()){revokedSessions.delete(hash);return false;}
  return true;
}

function revokeSession(token:string,expires:number):boolean{
  if(!token||!Number.isSafeInteger(expires)||expires<=Date.now())return false;
  loadRevokedSessions();
  revokedSessions.set(sessionHash(token),expires);
  const items=[...revokedSessions.entries()]
    .filter(([,value])=>value>Date.now())
    .sort((a,b)=>a[1]-b[1])
    .slice(-2048)
    .map(([hash,value])=>({hash,expires:value}));
  try{
    mkdirSync(path.dirname(revokedSessionsPath),{recursive:true});
    const temp=revokedSessionsPath+"."+randomUUID()+".tmp";
    writeFileSync(temp,JSON.stringify(items)+"\n","utf8");
    renameSync(temp,revokedSessionsPath);
    return true;
  }catch{return false;}
}

function adminSessionSecret(){
  return process.env.ADMIN_ACCESS_KEY||"";
}

function signAdminSession(payload:string){
  return createHmac("sha256",adminSessionSecret()).update(payload).digest("hex");
}

const userSessionSecretPath=path.join(process.cwd(),"Storage",".user-session-secret");

function userSessionSecret(){
  if(!existsSync(userSessionSecretPath)){
    const generated=randomBytes(32).toString("base64url");
    try{writeFileSync(userSessionSecretPath,generated,{encoding:"utf8",flag:"wx"});}
    catch(error){if(!(error&&typeof error==="object"&&"code" in error&&(error as {code?:string}).code==="EEXIST"))throw error;}
  }
  const secret=readFileSync(userSessionSecretPath,"utf8").trim();
  if(secret.length<32)throw new Error("user_session_secret_invalid");
  return secret;
}

function signUserSession(payload:string){
  return createHmac("sha256",userSessionSecret()).update(payload).digest("hex");
}

function prune<T>(map:Map<string,T>,expired:(value:T)=>boolean){
  if(map.size<512)return;
  for(const [key,value] of map)if(expired(value))map.delete(key);
}

function configuredProxyHeader(){
  if(process.env.TRUSTED_PROXY!=="true")return null;
  const header=(process.env.TRUSTED_PROXY_HEADER||"x-real-ip").trim().toLowerCase();
  return header==="cf-connecting-ip"||header==="x-real-ip"||header==="x-forwarded-for"?header:null;
}
export function clientKey(request:Request){
  const header=configuredProxyHeader();
  if(header){
    const value=request.headers.get(header)?.split(",")[0]?.trim()||"";
    if(value&&value.length<=128)return value;
  }
  const requestScopedId=request.headers.get("x-shiny-rate-id")?.trim()||"";
  return /^[A-Za-z0-9_-]{16,128}$/.test(requestScopedId)?requestScopedId:"unknown";
}

export function allowAttempt(key:string,windowMs=5000):boolean|Promise<boolean>{
  if(databaseMode())return dbSecurity.allowAttemptDb(key,windowMs);
  const now=Date.now();
  prune(attempts,expires=>now-expires>=windowMs);
  const last=attempts.get(key)||0;
  if(now-last<windowMs)return false;
  attempts.set(key,now);
  return true;
}

export function allowAuthAttempt(kind:"login"|"register",key:string,maxAttempts=5,windowMs=60_000):boolean|Promise<boolean>{
  if(databaseMode())return dbSecurity.allowAuthAttemptDb(kind,key,maxAttempts,windowMs);
  const now=Date.now();
  prune(authWindows,entry=>entry.reset<=now);
  const mapKey=kind+":"+key;
  const current=authWindows.get(mapKey);
  if(!current||current.reset<=now){authWindows.set(mapKey,{count:1,reset:now+windowMs});return true;}
  if(current.count>=maxAttempts)return false;
  current.count+=1;
  return true;
}

function pruneCsrf(now:number){
  for(const [token,expires] of csrfTokens)if(expires<=now)csrfTokens.delete(token);
}
export function createCsrf():string|null|Promise<string|null>{
  if(databaseMode())return dbSecurity.createCsrfDb();
  const now=Date.now();
  if(++csrfCreateCounter%64===0||csrfTokens.size>=csrfTokenLimit)pruneCsrf(now);
  if(csrfTokens.size>=csrfTokenLimit)return null;
  const token=randomBytes(32).toString("hex");
  csrfTokens.set(token,now+15*60_000);
  return token;
}
export function validCsrf(token:string):boolean|Promise<boolean>{
  if(databaseMode())return dbSecurity.validCsrfDb(token);
  if(!token||token.length!==64)return false;
  const expires=csrfTokens.get(token);
  if(!expires)return false;
  if(expires<=Date.now()){csrfTokens.delete(token);return false;}
  csrfTokens.delete(token);
  return true;
}

export function createAdminSession():string|Promise<string>{
  if(databaseMode())return dbSecurity.createAdminSessionDb((process.env.ADMIN_USER||"OWNER").trim()||"OWNER");
  const expires=Date.now()+adminSessionLifetime;
  const payload=expires+"."+randomUUID();
  return payload+"."+signAdminSession(payload);
}

export function validAdminSession(id:string):boolean|Promise<boolean>{
  if(databaseMode())return dbSecurity.validAdminOwnerSessionDb(id);
  if(id.length>2048||!adminSessionSecret()||sessionRevoked(id))return false;
  const parts=id.split(".");
  if(parts.length!==3)return false;
  const [expiresText,sessionId,signature]=parts;
  if(!expiresText||!sessionId||!signature)return false;
  const expires=Number(expiresText);
  if(!Number.isSafeInteger(expires)||expires<Date.now())return false;
  const expected=signAdminSession(expiresText+"."+sessionId);
  const actual=Buffer.from(signature);
  const expectedBuffer=Buffer.from(expected);
  return actual.length===expectedBuffer.length&&timingSafeEqual(actual,expectedBuffer);
}

export function adminAccessLevel(){return (process.env.ADMIN_ACCESS_LEVEL||"").trim().toUpperCase();}
export function adminOwnerConfiguration(){const level=adminAccessLevel();return level==="OWNER"?"OWNER":level?"INVALID":"MISSING";}
export function validAdminOwnerSession(id:string):boolean|Promise<boolean>{return databaseMode()?dbSecurity.validAdminOwnerSessionDb(id):validAdminSession(id)&&adminAccessLevel()==="OWNER";}
export function createUserSession(userId:string):string|Promise<string>{
  if(databaseMode())return dbSecurity.createUserSessionDb(userId);
  const expires=Date.now()+7*24*60*60_000;
  const payload=Buffer.from(JSON.stringify({userId,expires}),"utf8").toString("base64url");
  return payload+"."+signUserSession(payload);
}
export function validUserSession(token:string):string|null|Promise<string|null>{
  if(databaseMode())return dbSecurity.validUserSessionDb(token);
  if(token.length>4096||sessionRevoked(token))return null;
  const [payload,signature]=token.split(".");
  if(!payload||!signature)return null;
  const expected=signUserSession(payload);
  const actual=Buffer.from(signature);const expectedBuffer=Buffer.from(expected);
  if(actual.length!==expectedBuffer.length||!timingSafeEqual(actual,expectedBuffer))return null;
  try{
    const parsed=JSON.parse(Buffer.from(payload,"base64url").toString("utf8")) as {userId?:unknown;expires?:unknown};
    if(typeof parsed.userId!=="string"||typeof parsed.expires!=="number"||!Number.isSafeInteger(parsed.expires)||parsed.expires<Date.now())return null;
    return parsed.userId;
  }catch{return null;}
}
export function revokeAdminSession(token:string):boolean|Promise<boolean>{
  if(databaseMode())return dbSecurity.revokeAdminSessionDb(token);
  const expires=Number(token.split(".")[0]);
  return revokeSession(token,expires);
}
export function deleteUserSession(token:string):boolean|Promise<boolean>{
  if(databaseMode())return dbSecurity.deleteUserSessionDb(token);
  try{
    const payload=token.split(".")[0]||"";
    const parsed=JSON.parse(Buffer.from(payload,"base64url").toString("utf8")) as {expires?:unknown};
    if(typeof parsed.expires==="number")return revokeSession(token,parsed.expires);
  }catch{}
  return false;
}
export function safeEqual(left:string,right:string){const a=Buffer.from(left);const b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b);}
