import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {allowAuthAttempt,clientKey,createUserSession,validCsrf} from "@/Lib/SECURITY";
import {audit} from "@/Lib/AUDIT";
import {createUser,passwordIsStrong} from "@/Lib/AUTH";
import {verifyHCaptcha} from "@/Lib/HCAPTCHA";
import {dispatchWebhookEvent} from "@/Lib/WEBHOOKS";
import {readJsonBody} from "@/Lib/BODY_LIMITS";

const schema=z.object({username:z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_.-]+$/),email:z.string().trim().email().max(254),password:z.string().min(10).max(128),confirmPassword:z.string().min(1).max(128),hcaptchaToken:z.string().max(4096)});
const maxBody=16_384;

export async function POST(request:NextRequest){
  const key=clientKey(request);
  if(!await allowAuthAttempt("register",key)){await audit("user_register_rate_limited",request);return NextResponse.json({error:"rate_limited"},{status:429});}
  const contentLength=Number(request.headers.get("content-length")||0);
  if(contentLength>maxBody)return NextResponse.json({error:"invalid_request"},{status:413});
  const csrf=request.headers.get("x-csrf-token")||"";
  const stored=request.cookies.get("shiny_csrf")?.value||"";
  if(!csrf||csrf!==stored||!await validCsrf(csrf)){await audit("user_register_csrf_rejected",request);return NextResponse.json({error:"invalid_csrf"},{status:403});}
  const body=await readJsonBody(request,maxBody);
  if(!body.ok)return NextResponse.json({error:"invalid_request"},{status:body.reason==="too_large"?413:400});
  const parsed=schema.safeParse(JSON.parse(body.body));
  if(!parsed.success)return NextResponse.json({error:"invalid_request"},{status:400});
  const {username,email,password,confirmPassword,hcaptchaToken}=parsed.data;
  if(password!==confirmPassword||!passwordIsStrong(password))return NextResponse.json({error:"password_invalid"},{status:400});
  const captcha=await verifyHCaptcha(hcaptchaToken,request);
  if(!captcha.ok){
    await audit("user_register_captcha_rejected",request,{reason:captcha.reason});
    if(captcha.reason==="not_configured")return NextResponse.json({error:"captcha_not_configured"},{status:503});
    if(captcha.reason==="network")return NextResponse.json({error:"captcha_unavailable"},{status:503});
    return NextResponse.json({error:"captcha_invalid"},{status:400});
  }
  const user=await createUser(username,email,password);
  if(!user){await audit("user_register_rejected",request);return NextResponse.json({error:"registration_failed"},{status:400});}
  const session=await createUserSession(user.id);
  const response=NextResponse.json({ok:true,user:{id:user.id,username:user.username,email:user.email}});
  response.cookies.set({name:"shiny_user_session",value:session,httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:7*24*60*60});
  await audit("user_register_success",request,{userId:user.id});
  void dispatchWebhookEvent("customer.created",{customerId:user.id,username:user.username},request).catch(()=>{});
  return response;
}
