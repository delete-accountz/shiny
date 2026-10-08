import {NextRequest,NextResponse} from "next/server";
import {validUserSession} from "@/Lib/SECURITY";
import {findUserById,publicUser} from "@/Lib/AUTH";

export async function GET(request:NextRequest){
  const id=await validUserSession(request.cookies.get("shiny_user_session")?.value||"");
  if(!id)return NextResponse.json({user:null});
  try{
    const user=await findUserById(id);
    return NextResponse.json({user:user?publicUser(user):null},{headers:{"cache-control":"no-store"}});
  }catch{
    return NextResponse.json({user:null});
  }
}
