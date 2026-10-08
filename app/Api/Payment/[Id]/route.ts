import {NextRequest,NextResponse} from "next/server";
import {allowAttempt,clientKey,validAdminOwnerSession} from "@/Lib/SECURITY";
import {audit} from "@/Lib/AUDIT";

export async function GET(request:NextRequest,{params}:{params:Promise<{Id:string}>}){
  const {Id:id}=await params;
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))return NextResponse.json({error:"invalid_id"},{status:400});
  if(!await allowAttempt("payment:"+clientKey(request)+":"+id,1000))return NextResponse.json({error:"rate_limited"},{status:429});
  const adminSession=request.cookies.get("shiny_admin_session")?.value||"";
  if(!await validAdminOwnerSession(adminSession)){
    await audit("payment_lookup_rejected",request,{result:"owner_required"});
    return NextResponse.json({error:"authentication_required"},{status:401});
  }
  const base=process.env.PROMISSE_API_BASE_URL;
  const key=process.env.PROMISSE_API_KEY;
  if(!base||!key)return NextResponse.json({error:"payment_not_configured"},{status:503});
  try{
    const response=await fetch(base.replace(/\/$/,"")+"/transactions/"+encodeURIComponent(id),{headers:{Authorization:key},cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    await audit("payment_lookup",request,{actor:"OWNER",resource:id,result:String(response.status)});
    return NextResponse.json(data,{status:response.status});
  }catch{
    await audit("payment_lookup_failed",request,{actor:"OWNER",resource:id,result:"upstream_error"});
    return NextResponse.json({error:"payment_unavailable"},{status:502});
  }
}
