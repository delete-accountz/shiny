import {NextRequest,NextResponse} from "next/server";
import {adminAccessLevel,allowAttempt,clientKey,createAdminSession,safeEqual,validCsrf} from "@/Lib/SECURITY";
import {audit} from "@/Lib/AUDIT";
import {readJsonBody} from "@/Lib/BODY_LIMITS";

const maxBody=4096;

export async function POST(request:NextRequest){
  const contentLength=Number(request.headers.get("content-length")||0);
  if(contentLength>maxBody){
    await audit("admin_body_rejected",request);
    return NextResponse.json({error:"invalid_request"},{status:413});
  }
  const csrf=request.headers.get("x-csrf-token")||"";
  const stored=request.cookies.get("shiny_csrf")?.value||"";
  if(!csrf||csrf!==stored||!await validCsrf(csrf)){
    await audit("admin_csrf_rejected",request);
    return NextResponse.json({error:"invalid_csrf"},{status:403});
  }
  const body=await readJsonBody(request,maxBody);
  if(!body.ok)return NextResponse.json({error:"invalid_request"},{status:body.reason==="too_large"?413:400});
  const parsed=JSON.parse(body.body) as unknown;
  const object=parsed&&typeof parsed==="object"?parsed as Record<string,unknown>:{};
  const user=typeof object.user==="string"?object.user.trim():"";
  const accessKey=typeof object.key==="string"?object.key:"";
  const access=typeof object.access==="string"?object.access.trim():"";
  if(user.length<1||user.length>120||accessKey.length<1||accessKey.length>512||access.length<1||access.length>80){
    await audit("admin_input_rejected",request,{user,access});
    return NextResponse.json({error:"invalid_request"},{status:400});
  }
  const client=clientKey(request);
  const rateKey=client==="unknown"?"admin-user:"+user.toLowerCase():"admin:"+client;
  if(!await allowAttempt(rateKey,5000)){
    await audit("admin_rate_limited",request,{user,access});
    return NextResponse.json({error:"rate_limited"},{status:429});
  }
  const configuredAccess=adminAccessLevel();
  if(configuredAccess!=="OWNER"){
    await audit("admin_owner_configuration_invalid",request,{user,access});
    return NextResponse.json({error:"owner_not_configured"},{status:503});
  }
  const configuredUser=(process.env.ADMIN_USER||"").trim();
  const configuredAccessKey=(process.env.ADMIN_ACCESS_KEY||"").trim();
  const userMatch=safeEqual(user,configuredUser);
  const credentialMatch=safeEqual(accessKey.trim(),configuredAccessKey);
  const accessMatch=safeEqual(access.toUpperCase(),configuredAccess);
  if(!(userMatch&&credentialMatch&&accessMatch)){
    await audit("admin_login_failed",request,{user,access,userMatch,credentialMatch,accessMatch,userConfigured:configuredUser.length>0,credentialConfigured:configuredAccessKey.length>0});
    return NextResponse.json({error:"invalid_credentials"},{status:401});
  }
  const session=await createAdminSession();
  await audit("admin_login_success",request,{user,access});
  const response=NextResponse.json({ok:true,redirectTo:"/Vault"});
  response.cookies.set({name:"shiny_admin_session",value:session,httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:3600});
  return response;
}
