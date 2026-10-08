import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {allowAuthAttempt,clientKey,createUserSession,validCsrf} from "@/Lib/SECURITY";
import {audit} from "@/Lib/AUDIT";
import {findUserByEmail,verifyPassword} from "@/Lib/AUTH";
import {readJsonBody} from "@/Lib/BODY_LIMITS";

const schema=z.object({email:z.string().trim().email().max(254),password:z.string().min(1).max(128)});
const maxBody=8_192;
const genericError="Email ou senha inválidos.";

export async function POST(request:NextRequest){
  const key=clientKey(request);
  if(!await allowAuthAttempt("login",key)){await audit("user_login_rate_limited",request);return NextResponse.json({error:"rate_limited"},{status:429});}
  const contentLength=Number(request.headers.get("content-length")||0);
  if(contentLength>maxBody)return NextResponse.json({error:"invalid_request"},{status:413});
  const csrf=request.headers.get("x-csrf-token")||"";
  const stored=request.cookies.get("shiny_csrf")?.value||"";
  if(!csrf||csrf!==stored||!await validCsrf(csrf)){await audit("user_login_csrf_rejected",request);return NextResponse.json({error:"invalid_csrf"},{status:403});}
  const body=await readJsonBody(request,maxBody);
  if(!body.ok)return NextResponse.json({error:"invalid_request"},{status:body.reason==="too_large"?413:400});
  const parsed=schema.safeParse(JSON.parse(body.body));
  if(!parsed.success)return NextResponse.json({error:"invalid_credentials",message:genericError},{status:401});
  const user=await findUserByEmail(parsed.data.email);
  const valid=user?await verifyPassword(user,parsed.data.password):false;
  if(!user||!valid){await audit("user_login_failed",request);return NextResponse.json({error:"invalid_credentials",message:genericError},{status:401});}
  const session=await createUserSession(user.id);
  const response=NextResponse.json({ok:true,user:{id:user.id,username:user.username,email:user.email}});
  response.cookies.set({name:"shiny_user_session",value:session,httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:7*24*60*60});
  await audit("user_login_success",request,{userId:user.id});
  return response;
}
