import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {Pool} from "@neondatabase/serverless";

const APPLY=process.argv.includes("--apply");
const confirm=process.env.SHINY_REAL_DATA_MIGRATION_CONFIRM==="SHINY-STORE-EXPLICIT-IMPORT";
const url=process.env.DATABASE_URL?.trim()||"";
if(APPLY&&!confirm)throw new Error("Real import requires SHINY_REAL_DATA_MIGRATION_CONFIRM=SHINY-STORE-EXPLICIT-IMPORT.");
if(APPLY&&!url)throw new Error("DATABASE_URL must be explicitly supplied; .env.local is never loaded.");
const root=process.cwd();const storage=path.join(root,"Storage");

const files={
  users:["users.json"],products:["products.json"],coupons:["coupons.json"],orders:["orders.json"],
  analytics:["analytics.json"],posts:["posts.json"],faqs:["faq.json"],tickets:["tickets.json"],
  pending_webhooks:["promisse-pending-webhooks.json"]
};

async function load(name,filename){
  const target=path.join(storage,filename);
  try{await stat(target);const raw=await readFile(target,"utf8");return JSON.parse(raw);}
  catch(error){if(error?.code==="ENOENT")return [];throw new Error(name+"_invalid_or_unreadable");}
}
function digest(value){return createHash("sha256").update(JSON.stringify(value),"utf8").digest("hex");}
const report={generatedAt:new Date().toISOString(),mode:APPLY?"apply":"dry-run",entities:{},hashes:{}};
for(const [name,[filename]] of Object.entries(files)){
  const value=await load(name,filename);report.entities[name]=Array.isArray(value)?value.length:0;report.hashes[name]=digest(value);
}
process.stdout.write(JSON.stringify(report,null,2)+"\n");
if(!APPLY)process.exit(0);

const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:5000});
try{
  const marker="migration-"+randomUUID();
  await pool.query("CREATE TABLE IF NOT EXISTS migration_runs(id uuid PRIMARY KEY,mode varchar(16) NOT NULL,started_at timestamptz NOT NULL DEFAULT now(),report jsonb NOT NULL)");
  await pool.query("INSERT INTO migration_runs(id,mode,report) VALUES($1,'apply',$2::jsonb)",[marker,JSON.stringify(report)]);
  throw new Error("Controlled import mappings must be reviewed before enabling --apply.");
}finally{await pool.end();}
