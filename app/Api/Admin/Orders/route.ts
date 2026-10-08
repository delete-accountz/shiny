import {NextRequest,NextResponse} from "next/server";
import {allowAttempt,clientKey,validAdminOwnerSession} from "@/Lib/SECURITY";
import {readAdminOrders} from "@/Lib/ADMIN_ORDERS";

export const runtime="nodejs";

function json(data:unknown,status=200){
  return NextResponse.json(data,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
}
export async function GET(request:NextRequest){
  if(!await validAdminOwnerSession(request.cookies.get("shiny_admin_session")?.value||""))return json({error:"authentication_required"},401);
  if(!await allowAttempt("admin-orders:"+clientKey(request),1000))return json({error:"rate_limited"},429);
  try{return json(await readAdminOrders(),200);}
  catch{return json({error:"orders_unavailable"},503);}
}
