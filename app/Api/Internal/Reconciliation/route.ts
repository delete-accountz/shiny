import {createHmac,timingSafeEqual} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {cleanupSecurityState} from "@/Lib/DB/RECONCILIATION";
import {reconcilePendingOrders} from "@/Lib/RECONCILIATION";
import {audit} from "@/Lib/AUDIT";

export const runtime="nodejs";
export const maxDuration=30;

function validSecret(received:string,expected:string){
  const a=Buffer.from(received);const b=Buffer.from(expected);
  return Boolean(received&&expected&&a.length===b.length&&timingSafeEqual(a,b));
}
function digest(value:string){return createHmac("sha256","reconciliation-cron").update(value).digest("hex");}

export async function GET(request:NextRequest){
  if(process.env.RECONCILIATION_AUTOMATION_ENABLED!=="true"){
    return NextResponse.json({error:"reconciliation_automation_disabled"},{status:503});
  }
  const expected=process.env.CRON_SECRET?.trim()||"";
  const received=request.headers.get("authorization")?.trim()||"";
  if(!expected||!validSecret(received,"Bearer "+expected))return NextResponse.json({error:"authentication_required"},{status:401});

  try{
    await cleanupSecurityState();
    const results=await reconcilePendingOrders(20);
    const success=results.filter(result=>result.kind==="paid").length;
    const pending=results.filter(result=>result.kind==="pending").length;
    const errors=results.filter(result=>result.kind==="error").length;
    const summary=digest(JSON.stringify({success,pending,errors,count:results.length}));
    await audit("reconciliation_job_completed",request,{actor:"system",resource:"reconciliation",result:summary,success,pending,errors});
    return NextResponse.json({ok:true,count:results.length,success,pending,errors},{status:200});
  }catch{
    return NextResponse.json({error:"reconciliation_unavailable"},{status:503});
  }
}
