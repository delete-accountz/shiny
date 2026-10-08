import {mkdir,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import * as dbFaq from "./DB/FAQ";
const databaseMode=()=>process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true";

export type FAQ={id:string;question:string;answer:string;category:string;active:boolean;order:number;createdAt:string;updatedAt:string};
export type FAQInput={question:string;answer:string;category:string;active:boolean;order:number};
const faqPath=path.join(process.cwd(),"Storage","faq.json");
let chain:Promise<void>=Promise.resolve();
const seed=[["Como recebo meu produto?","Após a confirmação do pagamento, a entrega segue o fluxo definido para o produto. Se algo não chegar como esperado, o suporte oficial resolve o próximo passo."],["Posso comprar pelo Discord?","Sim. O Discord oficial é um canal de compra e atendimento da Shiny."],["E se eu tiver um problema depois da compra?","Você pode abrir um ticket autenticado pelo suporte da Shiny ou usar o Discord oficial e o email."],["Quais canais oficiais devo usar?","Somente o Discord oficial e o email spectrexiters@gmail.com."]] as const;
function seeded():FAQ[]{const now="";return seed.map(([question,answer],index)=>({id:"seed-"+index,question,answer,category:"Geral",active:true,order:index,createdAt:now,updatedAt:now}));}
async function readStored():Promise<FAQ[]|null>{try{return JSON.parse(await readFile(faqPath,"utf8")) as FAQ[];}catch(error){const code=error&&typeof error==="object"&&"code" in error?(error as {code?:string}).code:undefined;if(code==="ENOENT")return null;throw error;}}
async function persist(items:FAQ[]){await mkdir(path.dirname(faqPath),{recursive:true});const tmp=faqPath+"."+randomUUID()+".tmp";await writeFile(tmp,JSON.stringify(items,null,2)+"\n","utf8");await rename(tmp,faqPath);}
async function lock<T>(op:()=>Promise<T>){const previous=chain;let release!:()=>void;chain=new Promise(resolve=>{release=resolve});await previous;try{return await op();}finally{release();}}
export async function readFaq(){return databaseMode()?dbFaq.readFaq():(await readStored())??seeded();}
export async function createFaq(input:FAQInput){if(databaseMode())return dbFaq.createFaq(input);return lock(async()=>{const items=await readFaq();const now=new Date().toISOString();const faq:FAQ={id:randomUUID(),...input,createdAt:now,updatedAt:now};await persist([...items,faq]);return faq;});}
export async function updateFaq(id:string,input:FAQInput){if(databaseMode())return dbFaq.updateFaq(id,input);return lock(async()=>{const items=await readFaq();const index=items.findIndex(item=>item.id===id);if(index<0)return null;const next=[...items];next[index]={...next[index],...input,id,updatedAt:new Date().toISOString()};await persist(next);return next[index];});}
export async function deleteFaq(id:string){if(databaseMode())return dbFaq.deleteFaq(id);return lock(async()=>{const items=await readFaq();if(!items.some(item=>item.id===id))return false;await persist(items.filter(item=>item.id!==id));return true;});}
