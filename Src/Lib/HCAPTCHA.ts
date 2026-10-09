import {isIP} from "node:net";
const endpoint="https://api.hcaptcha.com/siteverify";
export type HCaptchaResult={ok:true}|{ok:false;reason:"not_configured"|"misconfigured"|"invalid"|"network"};
function trustedRemoteIp(request:Request){
  if(process.env.TRUSTED_PROXY!=="true")return "";
  const header=(process.env.TRUSTED_PROXY_HEADER||"x-real-ip").trim().toLowerCase();
  if(header!=="cf-connecting-ip"&&header!=="x-real-ip"&&header!=="x-forwarded-for")return "";
  const value=request.headers.get(header)?.split(",")[0]?.trim()||"";
  return isIP(value)?value:"";
}
export async function verifyHCaptcha(token:string,request:Request):Promise<HCaptchaResult>{
 const secret=process.env.HCAPTCHA_SECRET_KEY?.trim(); const sitekey=process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim();
 if(!secret||!sitekey)return {ok:false,reason:"not_configured"};
 if(!token||token.length>4096)return {ok:false,reason:"invalid"};
 const ip=trustedRemoteIp(request);
 const form=new URLSearchParams({secret,sitekey,response:token}); if(ip)form.set("remoteip",ip);
 const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),5000);
 try{const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form,signal:controller.signal,cache:"no-store"}); if(!response.ok)return {ok:false,reason:"network"}; const result=await response.json() as {success?:boolean;"error-codes"?:unknown}; if(result.success===true)return {ok:true}; const codes=Array.isArray(result["error-codes"])?result["error-codes"].filter((code):code is string=>typeof code==="string"):[]; if(codes.some(code=>["invalid-input-secret","missing-input-secret","sitekey-secret-mismatch","invalid-sitekey","not-using-dummy-passcode"].includes(code)))return {ok:false,reason:"misconfigured"}; return {ok:false,reason:"invalid"};}
 catch{return {ok:false,reason:"network"};} finally{clearTimeout(timeout);}
}
