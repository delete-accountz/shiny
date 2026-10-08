import {Pool,type PoolClient} from "@neondatabase/serverless";

let pool:Pool|null=null;

function requiredDatabaseUrl(){
  if(process.env.DATABASE_REQUIRED!=="true"||process.env.SHINY_STORAGE_MODE!=="database"){
    throw new Error("database_mode_required");
  }
  const url=process.env.DATABASE_URL?.trim();
  if(!url)throw new Error("database_not_configured");
  return url;
}

export function getDb(){
  if(!pool)pool=new Pool({connectionString:requiredDatabaseUrl(),max:5,idleTimeoutMillis:10_000,connectionTimeoutMillis:5_000});
  return pool;
}

export async function query<T=Record<string,unknown>>(text:string,values:unknown[]=[]){
  const result=await getDb().query(text,values);
  return result.rows as T[];
}

export async function withTransaction<T>(operation:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await getDb().connect();
  try{
    await client.query("BEGIN");
    const result=await operation(client);
    await client.query("COMMIT");
    return result;
  }catch(error){
    await client.query("ROLLBACK").catch(()=>{});
    throw error;
  }finally{
    client.release();
  }
}

export async function withAdvisoryLock<T>(client:PoolClient,key:string,operation:()=>Promise<T>){
  const result=await client.query<{locked:boolean}>("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked",[key]);
  if(!result.rows[0]?.locked)throw new Error("database_lock_busy");
  return operation();
}

export async function healthcheck(){
  const rows=await query<{ok:number}>("SELECT 1 AS ok");
  return rows[0]?.ok===1;
}

export type {PoolClient};
