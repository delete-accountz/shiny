import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {allowAuthAttempt,clientKey,createUserSession,validCsrf} from "@/Lib/SECURITY";
import {auditBestEffort,auditFailure} from "@/Lib/AUDIT";
import {createUser,passwordIsStrong} from "@/Lib/AUTH";
import {verifyHCaptcha} from "@/Lib/HCAPTCHA";
import {dispatchWebhookEvent} from "@/Lib/WEBHOOKS";
import {readJsonBody} from "@/Lib/BODY_LIMITS";

const schema=z.object({username:z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_.-]+$/),email:z.string().trim().email().max(254),password:z.string().min(10).max(128),confirmPassword:z.string().min(1).max(128),hcaptchaToken:z.string().max(4096)});
const maxBody=16_384;

export async function POST(request:NextRequest){
  const key=clientKey(request);
  let allowed:boolean;
  try{allowed=await allowAuthAttempt("register",key);}
  catch{await auditFailure("user_register_rate_limit_unavailable",request,{reason:"rate_limit_store_unavailable"}).catch(()=>{});return NextResponse.json({error:"registration_unavailable"},{status:503});}
  if(!allowed){await auditBestEffort("user_register_rate_limited",request);return NextResponse.json({error:"rate_limited"},{status:429});}
  const contentLength=Number(request.headers.get("content-length")||0);
  if(contentLength>maxBody)return NextResponse.json({error:"invalid_request"},{status:413});
  const csrf=request.headers.get("x-csrf-token")||"";
  const stored=request.cookies.get("shiny_csrf")?.value||"";
  let csrfValid=false;
  try{csrfValid=Boolean(csrf&&csrf===stored&&await validCsrf(csrf));}
  catch{await auditFailure("user_register_csrf_store_unavailable",request,{reason:"csrf_store_unavailable"}).catch(()=>{});return NextResponse.json({error:"registration_unavailable"},{status:503});}
  if(!csrfValid){await auditBestEffort("user_register_csrf_rejected",request);return NextResponse.json({error:"invalid_csrf"},{status:403});}
  const body=await readJsonBody(request,maxBody);
  if(!body.ok)return NextResponse.json({error:"invalid_request"},{status:body.reason==="too_large"?413:400});
  let decoded:unknown;
  try{decoded=JSON.parse(body.body);}catch{return NextResponse.json({error:"invalid_request"},{status:400});}
  const parsed=schema.safeParse(decoded);
  if(!parsed.success){
    const fields=new Set(parsed.error.issues.map(issue=>String(issue.path[0]||"")));
    if(fields.has("username"))return NextResponse.json({error:"invalid_username"},{status:400});
    if(fields.has("email"))return NextResponse.json({error:"invalid_email"},{status:400});
    if(fields.has("hcaptchaToken"))return NextResponse.json({error:"captcha_invalid"},{status:400});
    if(fields.has("password")||fields.has("confirmPassword"))return NextResponse.json({error:"password_invalid"},{status:400});
    return NextResponse.json({error:"invalid_request"},{status:400});
  }
  const {username,email,password,confirmPassword,hcaptchaToken}=parsed.data;
  if(password!==confirmPassword||!passwordIsStrong(password))return NextResponse.json({error:"password_invalid"},{status:400});
  const captcha=await verifyHCaptcha(hcaptchaToken,request);
  if(!captcha.ok){
    await auditBestEffort("user_register_captcha_rejected",request,{reason:captcha.reason});
    if(captcha.reason==="not_configured")return NextResponse.json({error:"captcha_not_configured"},{status:503});
    if(captcha.reason==="misconfigured")return NextResponse.json({error:"captcha_misconfigured"},{status:503});
    if(captcha.reason==="network")return NextResponse.json({error:"captcha_unavailable"},{status:503});
    return NextResponse.json({error:"captcha_invalid"},{status:400});
  }
  let user;
  try{user=await createUser(username,email,password);}
  catch{await auditFailure("user_register_storage_failed",request,{reason:"user_store_unavailable"}).catch(()=>{});return NextResponse.json({error:"registration_unavailable"},{status:503});}
  if(!user){await auditBestEffort("user_register_rejected",request);return NextResponse.json({error:"registration_failed"},{status:400});}
  let session:string;
  try{session=await createUserSession(user.id);}
  catch{await auditFailure("user_register_session_failed",request,{reason:"session_store_unavailable"}).catch(()=>{});return NextResponse.json({error:"account_created_login_required"},{status:503});}
  const response=NextResponse.json({ok:true,user:{id:user.id,username:user.username,email:user.email}});
  response.cookies.set({name:"shiny_user_session",value:session,httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:7*24*60*60});
  await auditBestEffort("user_register_success",request,{userId:user.id});
  void dispatchWebhookEvent("customer.created",{customerId:user.id,username:user.username},request).catch(()=>{});
  return response;
}
