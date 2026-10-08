import {mkdir,readFile,rename,unlink,writeFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {Product} from "./PRODUCTS";
import * as dbProducts from "./DB/PRODUCTS";

export type AdminProduct=Product&{active?:boolean;stock?:number;category?:string;tags?:string[];createdAt?:string;updatedAt?:string};
type ProductInput={name:string;price:number;description:string;image?:string;active:boolean;stock:number;category:string;tags:string[]};
const productsPath=path.join(process.cwd(),"Storage","products.json");
let productsChain:Promise<void>=Promise.resolve();
const databaseMode=()=>process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true";

async function readStored():Promise<AdminProduct[]>{
  try{
    const raw=await readFile(productsPath,"utf8");const parsed=JSON.parse(raw) as unknown;
    if(!Array.isArray(parsed))throw new Error("products_storage_invalid");
    return parsed.filter((item):item is AdminProduct=>{
      if(!item||typeof item!=="object")return false;
      const value=item as Record<string,unknown>;
      return typeof value.id==="string"&&typeof value.name==="string"&&typeof value.price==="number"&&typeof value.description==="string";
    });
  }catch(error){
    const code=error&&typeof error==="object"&&"code" in error?(error as {code?:string}).code:undefined;
    if(code==="ENOENT")return [];
    throw error;
  }
}
async function persist(products:AdminProduct[]){
  await mkdir(path.dirname(productsPath),{recursive:true});
  const temporary=productsPath+"."+randomUUID()+".tmp";
  try{await writeFile(temporary,JSON.stringify(products,null,2)+"\n","utf8");await rename(temporary,productsPath);}
  catch(error){await unlink(temporary).catch(()=>{});throw error;}
}
async function withProductsLock<T>(operation:()=>Promise<T>):Promise<T>{
  const previous=productsChain;let release!:()=>void;productsChain=new Promise<void>(resolve=>{release=resolve});await previous;
  try{return await operation();}finally{release();}
}
export async function readProducts(){return databaseMode()?dbProducts.readProducts():readStored();}
export async function createProduct(input:ProductInput){
  if(databaseMode())return dbProducts.createProduct(input);
  return withProductsLock(async()=>{
    const products=await readStored();
    const idBase=input.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48)||"produto";
    let id=idBase;let index=2;while(products.some(product=>product.id===id)){id=idBase+"-"+index;index+=1;}
    const now=new Date().toISOString();const product:AdminProduct={id,...input,createdAt:now,updatedAt:now};
    await persist([...products,product]);return product;
  });
}
export async function updateProduct(id:string,input:ProductInput){
  if(databaseMode())return dbProducts.updateProduct(id,input);
  return withProductsLock(async()=>{
    const products=await readStored();const index=products.findIndex(product=>product.id===id);if(index<0)return null;
    const current=products[index];const updated:AdminProduct={...current,...input,id,updatedAt:new Date().toISOString()};const next=[...products];next[index]=updated;
    await persist(next);return updated;
  });
}
export async function deleteProduct(id:string){
  if(databaseMode())return dbProducts.deleteProduct(id);
  return withProductsLock(async()=>{
    const products=await readStored();if(!products.some(product=>product.id===id))return false;
    await persist(products.filter(product=>product.id!==id));return true;
  });
}
