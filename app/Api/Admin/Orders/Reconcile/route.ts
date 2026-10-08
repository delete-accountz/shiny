import {NextRequest,NextResponse} from "next/server";
import {allowAttempt,clientKey,validAdminOwnerSession,validCsrf} from "@/Lib/SECURITY";
import {reconcilePendingOrders} from "@/Lib/RECONCILIATION";
import {readAdminOrders} from "@/Lib/ADMIN_ORDERS";
import {audit,auditFailure} from "@/Lib/AUDIT";

export const runtime="nodejs";

function json(data:unknown,status=200){
  return NextResponse.json(data,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
}
export async function POST(request:NextRequest){
  if(!await validAdminOwnerSession(request.cookies.get("shiny_admin_session")?.value||""))return json({error:"authentication_required"},401);
  const csrf=request.headers.get("x-csrf-token")||"";
  const stored=request.cookies.get("shiny_csrf")?.value||"";
  if(!csrf||csrf!==stored||!await validCsrf(csrf))return json({error:"invalid_csrf"},403);
  if(!await allowAttempt("admin-orders-reconcile:"+clientKey(request),60_000))return json({error:"rate_limited"},429);
  try{
    const results=await reconcilePendingOrders(10);
    const counts=results.reduce((acc,result)=>{acc[result.kind]+=1;return acc},{paid:0,pending:0,unchanged:0,error:0} as Record<string,number>);
    await audit("admin_orders_reconciled",request,{actor:(process.env.ADMIN_USER||"OWNER").trim()||"OWNER",result:"paid="+counts.paid+";pending="+counts.pending+";unchanged="+counts.unchanged+";error="+counts.error});
    return json({ok:true,results:counts,data:await readAdminOrders()},200);
  }catch{
    try{await auditFailure("admin_orders_reconcile_failed",request,{actor:(process.env.ADMIN_USER||"OWNER").trim()||"OWNER",result:"failure"});}catch{}
    return json({error:"reconciliation_failed"},503);
  }
}
