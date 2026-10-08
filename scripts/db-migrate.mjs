import {readFile,readdir} from "node:fs/promises";
import path from "node:path";
import {Pool} from "@neondatabase/serverless";

const databaseUrl=process.env.DATABASE_URL?.trim();
if(!databaseUrl)throw new Error("DATABASE_URL is required; this script never loads .env.local automatically.");
if(process.env.SHINY_STORAGE_MODE!=="database"||process.env.DATABASE_REQUIRED!=="true"){
  throw new Error("Set SHINY_STORAGE_MODE=database and DATABASE_REQUIRED=true before running migrations.");
}

const pool=new Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:5000});
try{
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version varchar(64) PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const dir=path.join(process.cwd(),"migrations");
  const files=(await readdir(dir)).filter(name=>/^\\d+_.+\\.sql$/.test(name)).sort();
  for(const file of files){
    const version=file.split("_",1)[0];
    const applied=await pool.query("SELECT 1 FROM schema_migrations WHERE version=$1",[version]);
    if(applied.rowCount)continue;
    const sql=await readFile(path.join(dir,file),"utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations(version) VALUES($1)",[version]);
    process.stdout.write(`applied ${file}\\n`);
  }
}finally{
  await pool.end();
}
