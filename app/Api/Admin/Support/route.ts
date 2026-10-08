import {NextRequest,NextResponse} from "next/server";
import {allowAttempt,clientKey,validAdminOwnerSession} from "@/Lib/SECURITY";
import {readTickets} from "@/Lib/TICKETS";
export async function GET(request:NextRequest){if(!await validAdminOwnerSession(request.cookies.get("shiny_admin_session")?.value||""))return NextResponse.json({error:"authentication_required"},{status:401});if(!await allowAttempt("admin-support:"+clientKey(request),1000))return NextResponse.json({error:"rate_limited"},{status:429});return NextResponse.json({tickets:await readTickets()},{headers:{"cache-control":"no-store"}});}
