import {NextRequest,NextResponse} from "next/server";
import {allowAttempt,clientKey,validAdminOwnerSession} from "@/Lib/SECURITY";
import {audit} from "@/Lib/AUDIT";
import {readAdminLogs,AdminLog} from "@/Lib/ADMIN_DATA";

function cell(value:unknown){const text=String(value??"");return /[",\n\r;]/.test(text)?'="'+text.replace(/"/g,'""')+'"':text;}
function date(value:string){const parsed=Date.parse(value);return Number.isNaN(parsed)?null:new Date(parsed);}
function matches(log:AdminLog,params:URLSearchParams){
  const action=params.get("action")?.trim().toLowerCase();const resource=params.get("resource")?.trim().toLowerCase();const result=params.get("result")?.trim().toLowerCase();
  const from=params.get("from")?date(params.get("from")!):null;const to=params.get("to")?date(params.get("to")+"T23:59:59.999Z"):null;const at=date(log.at);
  if(action&&!log.event.toLowerCase().includes(action))return false;if(resource&&!log.resource.toLowerCase().includes(resource))return false;if(result&&log.result.toLowerCase()!==result)return false;
  if(from&&(!at||at<from))return false;if(to&&(!at||at>to))return false;return true;
}
export async function GET(request:NextRequest){
  if(!await validAdminOwnerSession(request.cookies.get("shiny_admin_session")?.value||""))return NextResponse.json({error:"authentication_required"},{status:401});
  if(!await allowAttempt("admin-log-export:"+clientKey(request),3000))return NextResponse.json({error:"rate_limited"},{status:429});
  try{
    const params=request.nextUrl.searchParams;const logs=(await readAdminLogs()).filter(log=>matches(log,params));
    const body=[["Data","Ação","Usuário","Recurso","Resultado","Motivo","IP"],...logs.map(log=>[log.at,log.event,log.actor,log.resource,log.result,log.reason,log.ip])].map(row=>row.map(cell).join(",")).join("\r\n");
    await audit("admin_logs_exported",request,{actor:(process.env.ADMIN_USER||"OWNER").trim()||"OWNER",result:"success"});
    return new NextResponse("\uFEFF"+body,{status:200,headers:{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=\"shiny-audit-log.csv\"","cache-control":"no-store"}});
  }catch{await audit("admin_logs_export_failed",request,{actor:(process.env.ADMIN_USER||"OWNER").trim()||"OWNER",result:"failure"});return NextResponse.json({error:"storage_error"},{status:500});}
}
