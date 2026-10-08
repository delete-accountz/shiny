import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {allowAttempt,clientKey,validAdminOwnerSession} from "@/Lib/SECURITY";
import {analyticsSummary,trackAnalyticsEvent} from "@/Lib/ANALYTICS";
import {readJsonBody} from "@/Lib/BODY_LIMITS";
const maxBody=8_192;
const schema=z.object({event:z.enum(["page_view","product_view","checkout_start"]),path:z.string().trim().min(1).max(200).refine(value=>!/[\\r\\n\\u0000-\\u001F\\u007F]/.test(value),{message:"unsafe_string"})}).strict();
export async function POST(request:NextRequest){
  if(!await allowAttempt("analytics:"+clientKey(request),3000))return NextResponse.json({ok:false,error:"rate_limited"},{status:429});
  const body=await readJsonBody(request,maxBody);
  if(!body.ok)return NextResponse.json({ok:false,error:body.reason==="too_large"?"payload_too_large":"invalid_input"},{status:body.reason==="too_large"?413:400});
  const parsed=schema.safeParse(JSON.parse(body.body));
  if(!parsed.success)return NextResponse.json({ok:false,error:"invalid_input"},{status:400});
  try{await trackAnalyticsEvent(parsed.data.event,parsed.data.path.normalize("NFKC"));return NextResponse.json({ok:true},{status:202});}catch{return NextResponse.json({ok:false,error:"storage_error"},{status:500});}
}
export async function GET(request:NextRequest){if(!await validAdminOwnerSession(request.cookies.get("shiny_admin_session")?.value||""))return NextResponse.json({error:"authentication_required"},{status:401});if(!await allowAttempt("admin-analytics:"+clientKey(request),1000))return NextResponse.json({error:"rate_limited"},{status:429});const days=Math.min(365,Math.max(1,Number(request.nextUrl.searchParams.get("days")||30)));return NextResponse.json(await analyticsSummary(Number.isFinite(days)?days:30),{headers:{"cache-control":"no-store"}});}
