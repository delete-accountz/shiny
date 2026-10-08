import {NextRequest,NextResponse} from "next/server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {allowAttempt,clientKey,validAdminOwnerSession,validCsrf} from "@/Lib/SECURITY";
import {audit} from "@/Lib/AUDIT";
import {createPost,readPosts} from "@/Lib/POSTS";
import {dispatchWebhookEvent} from "@/Lib/WEBHOOKS";
import {parseJsonBody} from "@/Lib/BODY_LIMITS";

const maxBody=65_536;
const text=z.string().trim().refine(value=>!/[<>]/.test(value),{message:"html_not_allowed"});
const schema=z.object({
  title:text.min(1).max(180),slug:z.string().trim().max(100).regex(/^[A-Za-z0-9-]*$/),summary:text.max(500),content:text.min(1).max(30000),
  image:z.string().trim().max(500).refine(value=>value===""||value.startsWith("/")||/^https:\/\//i.test(value),{message:"image_url_invalid"}).optional().default(""),
  category:text.max(80),status:z.enum(["draft","published","scheduled"]),scheduledAt:z.string().datetime({offset:true}).optional().or(z.literal("")),
  seoTitle:text.max(180).optional().or(z.literal("")),seoDescription:text.max(300).optional().or(z.literal(""))
}).superRefine((value,ctx)=>{if(value.status==="scheduled"&&!value.scheduledAt)ctx.addIssue({code:"custom",path:["scheduledAt"],message:"schedule_required"});});
function actor(){return (process.env.ADMIN_USER||"OWNER").trim()||"OWNER";}
async function auth(request:NextRequest,mutation=false){
  if(!await validAdminOwnerSession(request.cookies.get("shiny_admin_session")?.value||""))return "authentication_required";
  if(mutation){const csrf=request.headers.get("x-csrf-token")||"";const stored=request.cookies.get("shiny_csrf")?.value||"";if(!csrf||csrf!==stored||!await validCsrf(csrf))return "invalid_csrf";}
  return null;
}
async function rate(request:NextRequest){return !await allowAttempt("admin-posts:"+clientKey(request),1000);}
export async function GET(request:NextRequest){
  const denied=await auth(request);if(denied)return NextResponse.json({error:denied},{status:401});if(await rate(request))return NextResponse.json({error:"rate_limited"},{status:429});
  try{return NextResponse.json({posts:await readPosts()},{headers:{"cache-control":"no-store"}});}catch{await audit("admin_posts_list_failed",request,{actor:actor(),result:"storage_error"});return NextResponse.json({error:"storage_error"},{status:500});}
}
export async function POST(request:NextRequest){
  const denied=await auth(request,true);if(denied)return NextResponse.json({error:denied},{status:denied==="invalid_csrf"?403:401});if(await rate(request))return NextResponse.json({error:"rate_limited"},{status:429});
  const body=await parseJsonBody(request,maxBody);if(!body.ok)return NextResponse.json({error:"invalid_input"},{status:body.reason==="too_large"?413:400});const parsed=schema.safeParse(body.data);if(!parsed.success)return NextResponse.json({error:"invalid_input"},{status:400});
  try{const post=await createPost({...parsed.data,scheduledAt:parsed.data.scheduledAt||undefined});if(!post)throw new Error("post_create_failed");revalidatePath("/News");revalidatePath("/News/"+post.slug);await audit("admin_post_created",request,{actor:actor(),resource:post.id,result:"success",status:post.status});if(post.status==="published")void dispatchWebhookEvent("post.created",{postId:post.id,slug:post.slug,title:post.title},request).catch(()=>{});return NextResponse.json({ok:true,post},{status:201});}
  catch{await audit("admin_post_create_failed",request,{actor:actor(),result:"storage_error"});return NextResponse.json({error:"storage_error"},{status:500});}
}
