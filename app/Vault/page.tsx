import {cookies} from "next/headers";
import {adminOwnerConfiguration,validAdminOwnerSession,validAdminSession} from "@/Lib/SECURITY";
import {readAdminData} from "@/Lib/ADMIN_DATA";
import VaultDashboard from "./VaultDashboard";
import VaultLogin from "./VaultLogin";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function AccessMessage({title,detail}:{title:string;detail:string}){
  return <main className="vault-page vault-access-state">
    <section className="vault-access-card" aria-labelledby="vault-access-title">
      <p className="vault-eyebrow">SHINY / SECURE ACCESS</p>
      <h1 id="vault-access-title">{title}</h1>
      <p>{detail}</p>
    </section>
  </main>;
}

export default async function Vault(){
  const cookieStore=await cookies();
  const session=cookieStore.get("shiny_admin_session")?.value||"";

  if(!await validAdminSession(session))return <VaultLogin />;

  const ownerConfiguration=adminOwnerConfiguration();
  if(ownerConfiguration!=="OWNER"){
    return <AccessMessage
      title="OWNER configuration required"
      detail={ownerConfiguration==="MISSING"
        ?"ADMIN_ACCESS_LEVEL is not configured on the server."
        :"ADMIN_ACCESS_LEVEL is configured but is not authorized for OWNER access."}
    />;
  }

  if(!validAdminOwnerSession(session)){
    return <AccessMessage
      title="Access denied"
      detail="This session is not authorized for OWNER access."
    />;
  }

  const data=await readAdminData();
  return <VaultDashboard data={data}/>;
}
