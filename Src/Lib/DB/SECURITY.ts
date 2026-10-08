import {createHmac,randomBytes,randomUUID,timingSafeEqual} from "node:crypto";
import {query,withTransaction} from "./index";

const hmacSecret=()=>{
  const value=process.env.SESSION_HMAC_SECRET?.trim()||"";
  if(value.length<32)throw new Error("session_hmac_secret_not_configured");
  return value;
};
const hash=(value:string)=>createHmac("sha256",hmacSecret()).update(value,"utf8").digest("hex");
const now=()=>new Date();
const db=()=>process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true";

export async function allowAttemptDb(key:string,windowMs=5000){
  if(!db())throw new Error("database_mode_required");
  const bucket=key.slice(0,300);const t=now();
  return withTransaction(async client=>{
    const row=await client.query<{windowStartedAt:string;attemptCount:number}>(`SELECT window_started_at AS "windowStartedAt",attempt_count AS "attemptCount"
      FROM rate_limit_buckets WHERE bucket_key=$1 FOR UPDATE`,[bucket]);
    if(!row.rows[0]||Date.parse(row.rows[0].windowStartedAt)+windowMs<=t.getTime()){
      await client.query(`INSERT INTO rate_limit_buckets(bucket_key,window_started_at,attempt_count,expires_at)
        VALUES($1,$2,1,$3) ON CONFLICT(bucket_key) DO UPDATE SET window_started_at=EXCLUDED.window_started_at,attempt_count=1,expires_at=EXCLUDED.expires_at`,
        [bucket,t,new Date(t.getTime()+windowMs)]);
      return true;
    }
    if(row.rows[0].attemptCount>=1)return false;
    await client.query(`UPDATE rate_limit_buckets SET attempt_count=attempt_count+1,expires_at=$2 WHERE bucket_key=$1`,[bucket,new Date(t.getTime()+windowMs)]);
    return true;
  });
}

export async function allowAuthAttemptDb(kind:"login"|"register",key:string,maxAttempts=5,windowMs=60_000){
  const bucket="auth:"+kind+":"+key;
  return withTransaction(async client=>{
    const t=now();
    const row=await client.query<{windowStartedAt:string;attemptCount:number}>(`SELECT window_started_at AS "windowStartedAt",attempt_count AS "attemptCount"
      FROM rate_limit_buckets WHERE bucket_key=$1 FOR UPDATE`,[bucket]);
    if(!row.rows[0]||Date.parse(row.rows[0].windowStartedAt)+windowMs<=t.getTime()){
      await client.query(`INSERT INTO rate_limit_buckets(bucket_key,window_started_at,attempt_count,expires_at)
        VALUES($1,$2,1,$3) ON CONFLICT(bucket_key) DO UPDATE SET window_started_at=EXCLUDED.window_started_at,attempt_count=1,expires_at=EXCLUDED.expires_at`,
        [bucket,t,new Date(t.getTime()+windowMs)]);
      return true;
    }
    if(row.rows[0].attemptCount>=maxAttempts)return false;
    await client.query(`UPDATE rate_limit_buckets SET attempt_count=attempt_count+1,expires_at=$2 WHERE bucket_key=$1`,[bucket,new Date(t.getTime()+windowMs)]);
    return true;
  });
}

export async function createCsrfDb(){
  const token=randomBytes(32).toString("hex");const tokenHash=hash(token);const expires=new Date(Date.now()+15*60_000);
  const count=await query<{count:string}>(`SELECT count(*)::text AS count FROM csrf_tokens WHERE expires_at>now()`);
  if(Number(count[0]?.count||0)>=4096)return null;
  await query(`INSERT INTO csrf_tokens(token_hash,expires_at) VALUES($1,$2)`,[tokenHash,expires]);
  return token;
}

export async function validCsrfDb(token:string){
  if(token.length!==64)return false;
  return withTransaction(async client=>{
    const result=await client.query<{tokenHash:string}>(`DELETE FROM csrf_tokens WHERE token_hash=$1 AND expires_at>now() RETURNING token_hash AS "tokenHash"`,[hash(token)]);
    return result.rowCount===1;
  });
}

function signedUserToken(userId:string,expires:Date){
  const payload=Buffer.from(JSON.stringify({userId,expires:expires.getTime()}),"utf8").toString("base64url");
  return payload+"."+createHmac("sha256",hmacSecret()).update(payload).digest("hex");
}
function parseSignedUserToken(token:string){
  const [payload,signature]=token.split(".");
  if(!payload||!signature||signature.length!==64)return null;
  const expected=createHmac("sha256",hmacSecret()).update(payload).digest("hex");
  if(Buffer.byteLength(signature)!==Buffer.byteLength(expected))return null;
  if(!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
  try{
    const parsed=JSON.parse(Buffer.from(payload,"base64url").toString("utf8")) as {userId?:unknown;expires?:unknown};
    const expires=typeof parsed.expires==="number"&&Number.isSafeInteger(parsed.expires)?parsed.expires:null;
    if(typeof parsed.userId!=="string"||expires===null)return null;
    return {userId:parsed.userId,expires};
  }catch{return null;}
}
export async function createUserSessionDb(userId:string){
  const expires=new Date(Date.now()+7*24*60*60_000);const token=signedUserToken(userId,expires);const tokenHash=hash(token);
  await query(`INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)`,[randomUUID(),userId,tokenHash,expires]);
  return token;
}
export async function validUserSessionDb(token:string){
  const parsed=parseSignedUserToken(token);if(!parsed||parsed.expires<Date.now())return null;
  const revoked=await query<{x:number}>(`SELECT 1 AS x FROM session_revocations WHERE token_hash=$1 AND expires_at>now() LIMIT 1`,[hash(token)]);
  if(revoked.length)return null;
  const rows=await query<{userId:string}>(`SELECT user_id AS "userId" FROM sessions WHERE token_hash=$1 AND expires_at>now() AND revoked_at IS NULL LIMIT 1`,[hash(token)]);
  if(!rows[0]||rows[0].userId!==parsed.userId)return null;
  await query(`UPDATE sessions SET last_seen_at=now() WHERE token_hash=$1`,[hash(token)]);
  return rows[0].userId;
}
export async function deleteUserSessionDb(token:string){
  const parsed=parseSignedUserToken(token);if(!parsed)return false;
  const tokenHash=hash(token);const expires=new Date(parsed.expires);
  const changed=await withTransaction(async client=>{
    const result=await client.query(`UPDATE sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL`,[tokenHash]);
    await client.query(`INSERT INTO session_revocations(token_hash,expires_at) VALUES($1,$2) ON CONFLICT(token_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at,revoked_at=now()`,[tokenHash,expires]);
    return result.rowCount===1;
  });
  return changed;
}

function signedAdminToken(expires:Date){
  const payload=Buffer.from(JSON.stringify({expires:expires.getTime(),id:randomUUID()}),"utf8").toString("base64url");
  return payload+"."+createHmac("sha256",hmacSecret()).update("admin:"+payload).digest("hex");
}
function parseAdminToken(token:string){
  const [payload,signature]=token.split(".");
  if(!payload||!signature||signature.length!==64)return null;
  const expected=createHmac("sha256",hmacSecret()).update("admin:"+payload).digest("hex");
  const crypto=require("node:crypto");if(!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
  try{
    const parsed=JSON.parse(Buffer.from(payload,"base64url").toString("utf8")) as {expires?:unknown};
    const expires=typeof parsed.expires==="number"&&Number.isSafeInteger(parsed.expires)?parsed.expires:null;
    return expires===null?null:{expires};
  }catch{return null;}
}
export async function createAdminSessionDb(username:string){
  const expires=new Date(Date.now()+60*60_000);const token=signedAdminToken(expires);
  await query(`INSERT INTO admin_sessions(id,token_hash,actor_username,access_level,expires_at) VALUES($1,$2,$3,'OWNER',$4)`,[randomUUID(),hash(token),username,expires]);
  return token;
}
export async function validAdminOwnerSessionDb(token:string){
  const parsed=parseAdminToken(token);if(!parsed||parsed.expires<Date.now())return false;
  const rows=await query<{username:string}>(`SELECT actor_username AS username FROM admin_sessions WHERE token_hash=$1 AND access_level='OWNER' AND expires_at>now() AND revoked_at IS NULL LIMIT 1`,[hash(token)]);
  return Boolean(rows[0]);
}
export async function revokeAdminSessionDb(token:string){
  const parsed=parseAdminToken(token);if(!parsed)return false;
  const tokenHash=hash(token);
  return withTransaction(async client=>{
    const result=await client.query(`UPDATE admin_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL`,[tokenHash]);
    await client.query(`INSERT INTO session_revocations(token_hash,expires_at) VALUES($1,$2) ON CONFLICT(token_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at,revoked_at=now()`,[tokenHash,new Date(parsed.expires)]);
    return result.rowCount===1;
  });
}
