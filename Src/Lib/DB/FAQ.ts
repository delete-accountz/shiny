import {randomUUID} from "node:crypto";
import {query} from "./index";
import type {FAQ,FAQInput} from "../FAQ";
type Row={id:string;question:string;answer:string;category:string;active:boolean;order:number;createdAt:string;updatedAt:string};
const select="SELECT id,question,answer,category,active,sort_order AS \"order\",created_at AS \"createdAt\",updated_at AS \"updatedAt\" FROM faqs";
const map=(r:Row):FAQ=>({id:r.id,question:r.question,answer:r.answer,category:r.category,active:r.active,order:r.order,createdAt:r.createdAt,updatedAt:r.updatedAt});
export async function readFaq(){return (await query<Row>(select+" ORDER BY sort_order ASC,created_at ASC")).map(map);}
export async function createFaq(input:FAQInput){const rows=await query<Row>("INSERT INTO faqs(id,question,answer,category,active,sort_order) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,question,answer,category,active,sort_order AS \"order\",created_at AS \"createdAt\",updated_at AS \"updatedAt\"",[randomUUID(),input.question,input.answer,input.category,input.active,input.order]);return rows[0]?map(rows[0]):null;}
export async function updateFaq(id:string,input:FAQInput){const rows=await query<Row>("UPDATE faqs SET question=$1,answer=$2,category=$3,active=$4,sort_order=$5,updated_at=now() WHERE id=$6 RETURNING id,question,answer,category,active,sort_order AS \"order\",created_at AS \"createdAt\",updated_at AS \"updatedAt\"",[input.question,input.answer,input.category,input.active,input.order,id]);return rows[0]?map(rows[0]):null;}
export async function deleteFaq(id:string){const rows=await query<{id:string}>("DELETE FROM faqs WHERE id=$1 RETURNING id",[id]);return rows.length>0;}