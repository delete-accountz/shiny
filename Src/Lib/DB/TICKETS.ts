import {randomUUID} from "node:crypto";
import {query} from "./index";
import type {Ticket,TicketStatus} from "../TICKETS";
type Row={id:string;userId:string;subject:string;message:string;status:TicketStatus;adminReply:string|null;createdAt:string;updatedAt:string};
const select="SELECT id,user_id AS \"userId\",subject,message,status,admin_reply AS \"adminReply\",created_at AS \"createdAt\",updated_at AS \"updatedAt\" FROM support_tickets";
const map=(r:Row):Ticket=>({id:r.id,userId:r.userId,subject:r.subject,message:r.message,status:r.status,adminReply:r.adminReply||undefined,createdAt:r.createdAt,updatedAt:r.updatedAt});
export async function readTickets(){return (await query<Row>(select+" ORDER BY updated_at DESC")).map(map);}
export async function readUserTickets(userId:string){return (await query<Row>(select+" WHERE user_id=$1 ORDER BY updated_at DESC",[userId])).map(map);}
export async function createTicket(userId:string,subject:string,message:string){const rows=await query<Row>("INSERT INTO support_tickets(id,user_id,subject,message,status) VALUES($1,$2,$3,$4,'open') RETURNING id,user_id AS \"userId\",subject,message,status,admin_reply AS \"adminReply\",created_at AS \"createdAt\",updated_at AS \"updatedAt\"",[randomUUID(),userId,subject,message]);return rows[0]?map(rows[0]):null;}
export async function updateTicket(id:string,status:TicketStatus,adminReply:string){const rows=await query<Row>("UPDATE support_tickets SET status=$1,admin_reply=CASE WHEN $2='' THEN admin_reply ELSE $2 END,updated_at=now() WHERE id=$3 RETURNING id,user_id AS \"userId\",subject,message,status,admin_reply AS \"adminReply\",created_at AS \"createdAt\",updated_at AS \"updatedAt\"",[status,adminReply.trim(),id]);return rows[0]?map(rows[0]):null;}