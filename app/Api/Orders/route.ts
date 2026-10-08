import {NextRequest,NextResponse} from "next/server";
import {allowAttempt,clientKey,validUserSession} from "@/Lib/SECURITY";
import {findUserById} from "@/Lib/AUTH";
import {readOrders} from "@/Lib/ORDERS";
import {publicOrderList} from "@/Lib/ORDER_VIEWS";

export const runtime="nodejs";

function json(data:unknown,status=200){
  return NextResponse.json(data,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
}

export async function GET(request:NextRequest){
  const key=clientKey(request);
  if(!await allowAttempt("orders:list:"+key,1000))return json({error:"rate_limited"},429);
  const userId=await validUserSession(request.cookies.get("shiny_user_session")?.value||"");
  if(!userId)return json({error:"authentication_required"},401);
  try{
    const user=await findUserById(userId);
    if(!user)return json({error:"authentication_required"},401);
    const limitText=request.nextUrl.searchParams.get("limit");
    const limit=limitText===null?50:Number(limitText);
    if(!Number.isInteger(limit)||limit<1||limit>50)return json({error:"invalid_limit"},400);
    const orders=(await readOrders()).filter(order=>order.userId===userId);
    return json({orders:publicOrderList(orders,limit)},200);
  }catch{
    return json({error:"orders_unavailable"},503);
  }
}
