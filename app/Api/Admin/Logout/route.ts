import {NextRequest,NextResponse} from "next/server";
import {allowAttempt,clientKey,revokeAdminSession,validAdminOwnerSession,validCsrf} from "@/Lib/SECURITY";
import {audit} from "@/Lib/AUDIT";

export async function POST(request:NextRequest){
  if(!await validAdminOwnerSession(request.cookies.get("shiny_admin_session")?.value||""))return NextResponse.json({error:"authentication_required"},{status:401});
  if(!await allowAttempt("admin-logout:"+clientKey(request),1000))return NextResponse.json({error:"rate_limited"},{status:429});
  const csrf=request.headers.get("x-csrf-token")||"";const stored=request.cookies.get("shiny_csrf")?.value||"";
  if(!csrf||csrf!==stored||!await validCsrf(csrf)){await audit("admin_logout_csrf_rejected",request,{result:"invalid_csrf"});return NextResponse.json({error:"invalid_csrf"},{status:403});}
  const session=request.cookies.get("shiny_admin_session")?.value||"";
  if(!await revokeAdminSession(session)){
    await audit("admin_logout_failed",request,{actor:(process.env.ADMIN_USER||"OWNER").trim()||"OWNER",result:"revocation_failed"});
    return NextResponse.json({error:"logout_unavailable"},{status:503});
  }
  await audit("admin_logout",request,{actor:(process.env.ADMIN_USER||"OWNER").trim()||"OWNER",result:"success"});
  const response=NextResponse.json({ok:true});
  response.cookies.set({name:"shiny_admin_session",value:"",httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:0});
  return response;
}
