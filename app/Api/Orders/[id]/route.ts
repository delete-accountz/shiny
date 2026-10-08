import {NextRequest,NextResponse} from "next/server";
import {allowAttempt,clientKey,validUserSession} from "@/Lib/SECURITY";
import {findUserById} from "@/Lib/AUTH";
import {findOrderById} from "@/Lib/ORDERS";
import {toPublicOrder} from "@/Lib/ORDER_VIEWS";

export const runtime="nodejs";

function json(data:unknown,status=200){
  return NextResponse.json(data,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
}

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))return json({error:"invalid_id"},400);
  const key=clientKey(request);
  if(!await allowAttempt("orders:item:"+key+":"+id,1000))return json({error:"rate_limited"},429);
  const userId=await validUserSession(request.cookies.get("shiny_user_session")?.value||"");
  if(!userId)return json({error:"authentication_required"},401);
  try{
    const user=await findUserById(userId);
    if(!user)return json({error:"authentication_required"},401);
    const order=await findOrderById(id);
    if(!order||order.userId!==userId)return json({error:"order_not_found"},404);
    return json({order:toPublicOrder(order)},200);
  }catch{
    return json({error:"orders_unavailable"},503);
  }
}
