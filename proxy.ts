import {randomUUID} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {missingProductionConfiguration} from "./Src/Lib/PRODUCTION_CONFIG";

export function proxy(request:NextRequest){
  if(process.env.NODE_ENV==="production"){
    const missing=missingProductionConfiguration();
    if(missing.length){
      return NextResponse.json({error:"production_configuration_incomplete"},{status:503});
    }
    if(process.env.SHINY_STORAGE_MODE!=="database"||process.env.DATABASE_REQUIRED!=="true"){
      return NextResponse.json({error:"database_deployment_not_configured"},{status:503});
    }
  }
  if(process.env.NODE_ENV==="production"&&request.headers.get("x-forwarded-proto")==="http"){
    const url=request.nextUrl.clone();
    url.protocol="https:";
    return NextResponse.redirect(url,308);
  }

  const rateCookie=request.cookies.get("shiny_rl_id")?.value||"";
  const rateId=/^[A-Za-z0-9_-]{16,128}$/.test(rateCookie)?rateCookie:crypto.randomUUID();
  const nonce=Buffer.from(crypto.randomUUID()).toString("base64");
  const development=process.env.NODE_ENV!=="production";
  const csp=[
    "default-src 'self'",
    "script-src 'self' 'nonce-"+nonce+"' 'strict-dynamic'"+(development?" 'unsafe-eval'":"")+" https://hcaptcha.com https://*.hcaptcha.com",
    "style-src 'self' 'nonce-"+nonce+"' https://hcaptcha.com https://*.hcaptcha.com",
    "img-src 'self' data: blob: https://hcaptcha.com https://*.hcaptcha.com",
    "font-src 'self'",
    "connect-src 'self' https://hcaptcha.com https://*.hcaptcha.com",
    "frame-src 'self' https://hcaptcha.com https://*.hcaptcha.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join("; ");

  const requestHeaders=new Headers(request.headers);
  requestHeaders.set("x-nonce",nonce);
  requestHeaders.set("x-shiny-rate-id",rateId);
  requestHeaders.set("Content-Security-Policy",csp);

  const response=NextResponse.next({request:{headers:requestHeaders}});
  response.headers.set("Content-Security-Policy",csp);
  if(!rateCookie)response.cookies.set({name:"shiny_rl_id",value:rateId,httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:24*60*60});
  return response;
}

export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};

