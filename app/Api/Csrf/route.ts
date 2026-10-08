import {NextRequest,NextResponse} from "next/server";
import {allowAttempt,clientKey,createCsrf} from "@/Lib/SECURITY";
export async function GET(request:NextRequest){
  if(!await allowAttempt("csrf:"+clientKey(request),1000))return NextResponse.json({error:"rate_limited"},{status:429});
  const token=await createCsrf();
  if(!token)return NextResponse.json({error:"csrf_capacity_reached"},{status:503});
  const response=NextResponse.json({token});
  response.cookies.set({name:"shiny_csrf",value:token,httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:900});
  return response;
}