import {mkdir,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import * as dbTickets from "./DB/TICKETS";
const databaseMode=()=>process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true";
export type TicketStatus="open"|"in_progress"|"resolved";
export type Ticket={id:string;userId:string;subject:string;message:string;status:TicketStatus;adminReply?:string;createdAt:string;updatedAt:string};
const ticketPath=path.join(process.cwd(),"Storage","tickets.json");let chain:Promise<void>=Promise.resolve();
async function readStored():Promise<Ticket[]>{try{return JSON.parse(await readFile(ticketPath,"utf8")) as Ticket[];}catch(error){const code=error&&typeof error==="object"&&"code" in error?(error as {code?:string}).code:undefined;if(code==="ENOENT")return [];throw error;}}
async function persist(items:Ticket[]){await mkdir(path.dirname(ticketPath),{recursive:true});const tmp=ticketPath+"."+randomUUID()+".tmp";await writeFile(tmp,JSON.stringify(items,null,2)+"\n","utf8");await rename(tmp,ticketPath);}
async function lock<T>(op:()=>Promise<T>){const previous=chain;let release!:()=>void;chain=new Promise(resolve=>{release=resolve});await previous;try{return await op();}finally{release();}}
export async function readTickets(){return databaseMode()?dbTickets.readTickets():(await readStored()).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));}
export async function readUserTickets(userId:string){return databaseMode()?dbTickets.readUserTickets(userId):(await readTickets()).filter(ticket=>ticket.userId===userId);}
export async function createTicket(userId:string,subject:string,message:string){if(databaseMode())return dbTickets.createTicket(userId,subject,message);return lock(async()=>{const items=await readStored();const now=new Date().toISOString();const ticket:Ticket={id:randomUUID(),userId,subject,message,status:"open",createdAt:now,updatedAt:now};await persist([...items,ticket]);return ticket;});}
export async function updateTicket(id:string,status:TicketStatus,adminReply:string){if(databaseMode())return dbTickets.updateTicket(id,status,adminReply);return lock(async()=>{const items=await readStored();const index=items.findIndex(ticket=>ticket.id===id);if(index<0)return null;const next=[...items];next[index]={...next[index],status,adminReply:adminReply.trim()||next[index].adminReply,updatedAt:new Date().toISOString()};await persist(next);return next[index];});}
