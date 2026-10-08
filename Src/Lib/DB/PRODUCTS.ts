import {randomUUID} from "node:crypto";
import {query,withTransaction} from "./index";
import type {AdminProduct} from "../ADMIN_STORE";

type Row={id:string;name:string;priceCents:string|number;description:string;image:string|null;active:boolean;stock:string|number;category:string;tags:unknown;createdAt:string;updatedAt:string};

const money=(v:string|number)=>Number(v)/100;
function map(row:Row):AdminProduct{
  return {id:row.id,name:row.name,price:money(row.priceCents),description:row.description,image:row.image||undefined,
    active:row.active,stock:Number(row.stock),category:row.category,tags:Array.isArray(row.tags)?row.tags.filter((x):x is string=>typeof x==="string"):[],
    createdAt:row.createdAt,updatedAt:row.updatedAt};
}
export async function readProducts(){
  const rows=await query<Row>(`SELECT p.id,p.name,p.price_cents AS "priceCents",p.description,p.image,p.active,
    i.available_quantity AS stock,p.category,p.tags,p.created_at AS "createdAt",p.updated_at AS "updatedAt"
    FROM products p JOIN inventory i ON i.product_id=p.id ORDER BY p.created_at ASC`);
  return rows.map(map);
}
export async function createProduct(input:{name:string;price:number;description:string;image?:string;active:boolean;stock:number;category:string;tags:string[]}){
  return withTransaction(async client=>{
    const id=randomUUID();const now=new Date();
    const result=await client.query<Row>(`INSERT INTO products(id,name,price_cents,description,image,active,category,tags)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      RETURNING id,name,price_cents AS "priceCents",description,image,active,0::bigint AS stock,category,tags,created_at AS "createdAt",updated_at AS "updatedAt"`,
      [id,input.name,Math.round(input.price*100),input.description,input.image||null,input.active,input.category,JSON.stringify(input.tags)]);
    await client.query(`INSERT INTO inventory(product_id,available_quantity) VALUES($1,$2)`,[id,input.stock]);
    const row=result.rows[0];if(!row)throw new Error("product_create_failed");row.stock=input.stock;return map(row);
  });
}
export async function updateProduct(id:string,input:{name:string;price:number;description:string;image?:string;active:boolean;stock:number;category:string;tags:string[]}){
  return withTransaction(async client=>{
    const current=await client.query<Row>(`SELECT p.id,p.name,p.price_cents AS "priceCents",p.description,p.image,p.active,
      i.available_quantity AS stock,p.category,p.tags,p.created_at AS "createdAt",p.updated_at AS "updatedAt"
      FROM products p JOIN inventory i ON i.product_id=p.id WHERE p.id=$1 FOR UPDATE`,[id]);
    if(!current.rows[0])return null;
    const result=await client.query<Row>(`UPDATE products SET name=$1,price_cents=$2,description=$3,image=$4,active=$5,category=$6,tags=$7::jsonb,version=version+1,updated_at=now()
      WHERE id=$8 RETURNING id,name,price_cents AS "priceCents",description,image,active,category,tags,created_at AS "createdAt",updated_at AS "updatedAt"`,
      [input.name,Math.round(input.price*100),input.description,input.image||null,input.active,input.category,JSON.stringify(input.tags),id]);
    await client.query(`UPDATE inventory SET available_quantity=$1,version=version+1,updated_at=now() WHERE product_id=$2`,[input.stock,id]);
    const row=result.rows[0];if(!row)throw new Error("product_update_failed");row.stock=input.stock;return map(row);
  });
}
export async function deleteProduct(id:string){
  const result=await query<{id:string}>(`DELETE FROM products WHERE id=$1 RETURNING id`,[id]);return result.length>0;
}
