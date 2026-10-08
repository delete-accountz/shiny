import {NextRequest,NextResponse} from "next/server";
import {allowAttempt,clientKey,deleteUserSession,validCsrf} from "@/Lib/SECURITY";
export async function POST(request:NextRequest){
  if(!await allowAttempt("auth-logout:"+clientKey(request),1000))return NextResponse.json({error:"rate_limited"},{status:429});
  const csrf=request.headers.get("x-csrf-token")||"";
  const stored=request.cookies.get("shiny_csrf")?.value||"";
  if(!csrf||csrf!==stored||!await validCsrf(csrf))return NextResponse.json({error:"invalid_csrf"},{status:403});
  const session=request.cookies.get("shiny_user_session")?.value;
  if(session&&!await deleteUserSession(session))return NextResponse.json({error:"logout_unavailable"},{status:503});
  const response=NextResponse.json({ok:true});
  response.cookies.set({name:"shiny_user_session",value:"",httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:0});
  return response;
}
