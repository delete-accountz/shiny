"use client";

import {useEffect,useState} from "react";

type AccessData={user:string;key:string;access:string};
type MessageKind="error"|"info";

function messageForStatus(status:number,error?:string){
  if(error==="invalid_request")return "Dados de acesso inválidos.";
  if(error==="invalid_credentials")return "Acesso negado. Verifique User, API Key e Access level.";
  if(error==="invalid_csrf")return "A validação de segurança expirou. Tente novamente.";
  if(error==="rate_limited")return "Muitas tentativas. Aguarde alguns segundos.";
  if(error==="owner_not_configured")return "O acesso OWNER não está configurado corretamente no servidor.";
  if(status===413)return "A requisição excedeu o tamanho permitido.";
  if(status===403)return "A validação de segurança foi rejeitada.";
  if(status===429)return "Muitas tentativas. Aguarde alguns segundos.";
  return "O serviço de acesso seguro retornou um erro.";
}

export default function VaultLogin(){
  const [data,setData]=useState<AccessData>({user:"",key:"",access:""});
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [messageKind,setMessageKind]=useState<MessageKind>("info");

  useEffect(()=>{
    const savedTheme=sessionStorage.getItem("shiny-theme");
    if(savedTheme==="light"||savedTheme==="dark")document.documentElement.dataset.theme=savedTheme;
  },[]);

  async function login(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(loading)return;
    const user=data.user.trim();
    const access=data.access.trim();
    if(!user||!data.key||!access){
      setMessageKind("error");
      setMessage("Preencha User, API Key e Access level.");
      return;
    }
    setLoading(true);
    setMessage("");
    try{
      const csrfResponse=await fetch("/Api/Csrf",{credentials:"same-origin",cache:"no-store"});
      const csrfPayload=await csrfResponse.json().catch(()=>({})) as {token?:string;error?:string};
      if(!csrfResponse.ok||!csrfPayload.token){
        setMessageKind("error");
        setMessage(csrfPayload.error==="rate_limited"?"Muitas solicitações de segurança. Aguarde um momento.":"Não foi possível preparar a validação de segurança.");
        return;
      }
      const response=await fetch("/Api/Admin/Login",{
        method:"POST",
        credentials:"same-origin",
        headers:{"content-type":"application/json","x-csrf-token":csrfPayload.token},
        body:JSON.stringify({user,key:data.key,access})
      });
      const payload=await response.json().catch(()=>({})) as {ok?:boolean;error?:string};
      if(!response.ok){
        setMessageKind("error");
        setMessage(messageForStatus(response.status,payload.error));
        return;
      }
      if(payload.ok===true){
        window.location.assign("/Vault");
        return;
      }
      setMessageKind("error");
      setMessage("Resposta inválida do serviço de acesso.");
    }catch{
      setMessageKind("error");
      setMessage("Não foi possível conectar ao serviço de acesso seguro.");
    }finally{
      setLoading(false);
    }
  }

  return <main className="vault-page">
    <section className="vault-shell" aria-labelledby="vault-title">
      <div className="vault-card">
        <div className="vault-card-glow" aria-hidden="true"/>
        <div className="vault-header">
          <div>
            <p className="vault-eyebrow">SHINY / SECURE ACCESS</p>
            <h1 id="vault-title">Access</h1>
            <p className="vault-status ready">OWNER authentication</p>
          </div>
          <span className="vault-lock" aria-hidden="true">◈</span>
        </div>
        <form className="vault-form" onSubmit={login} noValidate>
          <label className="vault-field">User
            <input disabled={loading} autoComplete="username" placeholder="User" value={data.user} onChange={e=>setData({...data,user:e.target.value})}/>
          </label>
          <label className="vault-field">API Key
            <input disabled={loading} autoComplete="off" placeholder="API Key" type="password" value={data.key} onChange={e=>setData({...data,key:e.target.value})}/>
          </label>
          <label className="vault-field">Access level
            <input disabled={loading} autoComplete="off" placeholder="Access level" value={data.access} onChange={e=>setData({...data,access:e.target.value})}/>
          </label>
          <button disabled={loading} className="vault-submit" type="submit">{loading?"Authenticating…":"Authenticate"}</button>
        </form>
        {message&&<p className={"vault-message "+messageKind} role="alert">{message}</p>}
        <p className="vault-note">As credenciais são verificadas somente no servidor. A API key não é enviada ao bundle.</p>
      </div>
    </section>
  </main>;
}
