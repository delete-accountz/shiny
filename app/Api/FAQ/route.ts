import {NextResponse} from "next/server";
import {readFaq} from "@/Lib/FAQ";
export async function GET(){const faq=(await readFaq()).filter(item=>item.active).sort((a,b)=>a.order-b.order);return NextResponse.json({faq},{headers:{"cache-control":"no-store"}});}
