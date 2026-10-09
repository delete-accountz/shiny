"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {products,Product} from "@/Lib/PRODUCTS";
import logoSrc from "../Public/Assets/Shiny0Fundo.png";
import bannerSrc from "../Public/Assets/ShinyBanner.png";
import HomeExperience from "./HomeExperience";
import HCaptchaWidget from "./HCaptchaWidget";
type Lang="pt"|"en";
type Tab="home"|"product"|"faq"|"support";
type Theme="dark"|"light";
type NoticeKind="success"|"error"|"warning"|"info";
type Notice={id:number;kind:NoticeKind;text:string;removing?:boolean};
type PublicFaq={id:string;question:string;answer:string;category:string;active:boolean;order:number};
type OrderItemView={productId:string;name:string;quantity:number;unitPrice:number};
type CheckoutPayment={orderId:string;status:"PENDING"|"PAID"|"FAILED"|"CANCELLED"|"EXPIRED";items:OrderItemView[];total:number;currency:"BRL";paymentStatus?:"pending"|"PAID"|"payment.failed";transactionIdMasked?:string;payment?:{copyPaste:string;qrCodeBase64:string};expiresAt?:string;createdAt:string;updatedAt:string;isVisuallyExpired:boolean;reconciliationRequired:boolean;message:string};
const copy={
pt:{
home:"Início",product:"Produtos",faq:"FAQ",support:"Suporte",login:"Entrar",details:"Ver detalhes",buy:"Comprar",
close:"Fechar",checkoutWait:"O checkout online aguarda a configuração segura da Promisse no servidor.",discordBuy:"Comprar via Discord",
faqTitle:"Perguntas frequentes",supportTitle:"Suporte direto, sem ruído.",supportText:"Para compra, entrega ou acesso, use os canais oficiais da Shiny ou abra um ticket autenticado.",
productTitle:"Escolha seu próximo upgrade.",productLead:"Produtos digitais apresentados com clareza, detalhes e uma jornada de compra curta.",
signIn:"Entrar",signUp:"Criar conta",visualOnly:"A conta ainda não está conectada ao backend.",
dark:"Alternar para tema claro",light:"Alternar para tema escuro",language:"Idioma",theme:"Tema",homeLogo:"Voltar para a página inicial",
menu:"Abrir menu",menuClose:"Fechar menu",next:"Próximo",previous:"Anterior",
faq1:"Como recebo meu produto?",faq2:"Posso comprar pelo Discord?",faq3:"E se eu tiver um problema depois da compra?",faq4:"Quais canais oficiais devo usar?",
answer1:"Após a confirmação do pagamento, a entrega segue o fluxo definido para o produto. Se algo não chegar como esperado, o suporte oficial resolve o próximo passo.",
answer2:"Sim. O Discord oficial é um canal de compra e atendimento da Shiny.",
answer3:"Envie sua dúvida pelo Discord oficial, por email ou abra um ticket autenticado nesta conta.",
answer4:"Somente o Discord oficial e o email spectrexiters@gmail.com.",
social:"Canais oficiais",discord:"Discord oficial",email:"Email",faqLead:"Respostas objetivas sobre compra, entrega e suporte oficial.",
accountWait:"A conta ainda não está conectada ao backend.",loginRequired:"Crie uma conta ou entre para comprar. Nenhuma conta é criada automaticamente.",supportDiscord:"Abrir Discord",supportEmail:"Enviar email"
},
en:{
home:"Home",product:"Products",faq:"FAQ",support:"Support",login:"Sign in",details:"View details",buy:"Buy",
close:"Close",discordBuy:"Buy via Discord",
faqTitle:"Frequently asked questions",supportTitle:"Direct support, no noise.",supportText:"For purchase, delivery or access questions, use Shiny's official channels or open an authenticated ticket.",
productTitle:"Choose your next upgrade.",productLead:"Digital products presented with clarity, detail and a short purchase path.",
signIn:"Sign in",signUp:"Create account",visualOnly:"Accounts are not connected to the backend yet.",
dark:"Switch to light theme",light:"Switch to dark theme",language:"Language",theme:"Theme",homeLogo:"Return to home",
menu:"Open menu",menuClose:"Close menu",next:"Next",previous:"Previous",
faq1:"How do I receive my product?",faq2:"Can I buy through Discord?",faq3:"What if I have a problem after purchase?",faq4:"Which official channels should I use?",
answer1:"After payment confirmation, delivery follows the product's defined fulfillment flow. If something does not arrive as expected, official support handles the next step.",
answer2:"Yes. The official Discord is a Shiny purchase and support channel.",
answer3:"Send your question through the official Discord or email, or open an authenticated ticket from your account.",
answer4:"Only the official Discord and spectrexiters@gmail.com.",
social:"Official channels",discord:"Official Discord",email:"Email",faqLead:"Clear answers about purchases, delivery and official support.",
checkoutWait:"Online checkout is waiting for secure Promisse server configuration.",accountWait:"Accounts are not connected to the backend yet.",loginRequired:"Create an account or sign in to buy. No account is created automatically.",supportDiscord:"Open Discord",supportEmail:"Send email"
}
};
function dateLabel(value:string){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(date);
}
function Icon({name}:{name:"sun"|"moon"|"menu"|"close"}){
if(name==="sun") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>;
if(name==="moon") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg>;
if(name==="menu") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>;
}
function orderStatusLabel(status:CheckoutPayment["status"],lang:Lang){
  const labels={
    pt:{PENDING:"Pagamento pendente",PAID:"Pagamento confirmado",FAILED:"Pagamento falho",CANCELLED:"Pedido cancelado",EXPIRED:"Pedido expirado"},
    en:{PENDING:"Payment pending",PAID:"Payment confirmed",FAILED:"Payment failed",CANCELLED:"Order cancelled",EXPIRED:"Order expired"}
  };
  return labels[lang][status];
}
export default function Store(){
const [lang,setLang]=useState<Lang>("pt");
const [tab,setTab]=useState<Tab>("home");
const [theme,setTheme]=useState<Theme>("dark");
const [catalog,setCatalog]=useState<Product[]>(products);
const [selected,setSelected]=useState<Product|null>(null);
const [checkout,setCheckout]=useState<CheckoutPayment|null>(null);
const [checkoutLoading,setCheckoutLoading]=useState(false);
const [checkoutRefreshing,setCheckoutRefreshing]=useState(false);
const [auth,setAuth]=useState(false);
const [authMode,setAuthMode]=useState<"login"|"register">("login");
const [authLoading,setAuthLoading]=useState(false);
const [authError,setAuthError]=useState("");
const [captchaToken,setCaptchaToken]=useState("");
const [captchaResetSignal,setCaptchaResetSignal]=useState(0);
const [user,setUser]=useState<{id:string;username:string;email:string}|null>(null);
const [faqData,setFaqData]=useState<PublicFaq[]>([]);
const [menuOpen,setMenuOpen]=useState(false);
const [openFaq,setOpenFaq]=useState(0);
const [notices,setNotices]=useState<Notice[]>([]);
const noticeId=useRef(0);
const timers=useRef<number[]>([]);
const panelTimer=useRef<number|null>(null);
const t=copy[lang];
const [closingPanel,setClosingPanel]=useState<"selected"|"auth"|null>(null);
const schedulePanelClose=useCallback((panel:"selected"|"auth",done:()=>void)=>{if(panelTimer.current!==null) window.clearTimeout(panelTimer.current);setClosingPanel(panel);panelTimer.current=window.setTimeout(()=>{panelTimer.current=null;done();setClosingPanel(null)},220)},[]);
const closeSelected=useCallback(()=>{if(!selected)return;schedulePanelClose("selected",()=>setSelected(null))},[selected,schedulePanelClose]);
const closeAuth=useCallback(()=>{if(!auth)return;schedulePanelClose("auth",()=>{setAuth(false);setAuthError("");setCaptchaToken("")})},[auth,schedulePanelClose]);
const closeNotice=useCallback((id:number)=>{setNotices(current=>current.map(item=>item.id===id?{...item,removing:true}:item));const timer=window.setTimeout(()=>setNotices(current=>current.filter(item=>item.id!==id)),220);timers.current.push(timer)},[]);
const notify=useCallback((kind:NoticeKind,text:string)=>{
const id=++noticeId.current;
setNotices(current=>[...current.slice(-2),{id,kind,text}]);
const timer=window.setTimeout(()=>{setNotices(current=>current.map(item=>item.id===id?{...item,removing:true}:item));const exitTimer=window.setTimeout(()=>setNotices(current=>current.filter(item=>item.id!==id)),220);timers.current.push(exitTimer)},4200);
timers.current.push(timer);
},[]);
useEffect(()=>{
try{
const savedTheme=sessionStorage.getItem("shiny-theme");
const savedLang=sessionStorage.getItem("shiny-lang");
if(savedTheme==="light"||savedTheme==="dark") setTheme(savedTheme);
if(savedLang==="pt"||savedLang==="en") setLang(savedLang);
}catch{}
return()=>{timers.current.forEach(window.clearTimeout);timers.current=[];if(panelTimer.current!==null){window.clearTimeout(panelTimer.current);panelTimer.current=null}};
},[]);
useEffect(()=>{sessionStorage.setItem("shiny-theme",theme);document.documentElement.dataset.theme=theme},[theme]);
useEffect(()=>{sessionStorage.setItem("shiny-lang",lang);document.documentElement.lang=lang==="pt"?"pt-BR":"en-US"},[lang]);
useEffect(()=>{fetch("/Api/Auth/Me",{credentials:"same-origin",cache:"no-store"}).then(response=>response.json()).then(data=>{if(data?.user)setUser(data.user)}).catch(()=>{})},[]);
useEffect(()=>{
  if(!user)return;
  const orderId=new URLSearchParams(window.location.search).get("order")||"";
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(orderId))return;
  fetch("/Api/Orders/"+encodeURIComponent(orderId),{credentials:"same-origin",cache:"no-store"})
    .then(async response=>({ok:response.ok,payload:await response.json().catch(()=>({})) as {order?:CheckoutPayment;error?:string}}))
    .then(result=>{if(result.ok&&result.payload.order)setCheckout(result.payload.order);else if(result.payload.error==="order_not_found")notify("error","Pedido não encontrado para esta conta.");})
    .catch(()=>notify("error","Não foi possível recuperar o pedido agora."));
},[user,notify]);
useEffect(()=>{fetch("/Api/FAQ",{cache:"no-store"}).then(response=>response.json()).then(data=>{if(Array.isArray(data?.faq))setFaqData(data.faq)}).catch(()=>{})},[]);
useEffect(()=>{
  fetch("/Api/Products",{cache:"no-store"})
    .then(async response=>({ok:response.ok,payload:await response.json().catch(()=>({})) as {products?:Product[]}}))
    .then(result=>{if(result.ok&&Array.isArray(result.payload.products))setCatalog(result.payload.products)})
    .catch(()=>{});
},[]);
useEffect(()=>{
const onKey=(event:KeyboardEvent)=>{
if(event.key!=="Escape") return;
closeSelected();closeAuth();setMenuOpen(false);
};
window.addEventListener("keydown",onKey);
return()=>window.removeEventListener("keydown",onKey);
},[closeSelected,closeAuth]);
const navigate=(next:Tab)=>{
setClosingPanel(null);setSelected(null);setAuth(false);setMenuOpen(false);setTab(next);
};
const trackAnalytics=(event:"page_view"|"product_view"|"checkout_start",path:string)=>{fetch("/Api/Analytics",{method:"POST",keepalive:true,headers:{"content-type":"application/json"},body:JSON.stringify({event,path})}).catch(()=>{})};
useEffect(()=>{trackAnalytics("page_view",tab==="home"?"/":"/#"+tab)},[tab]);
useEffect(()=>{if(selected)trackAnalytics("product_view","/product/"+selected.id)},[selected]);
const handleBuy=useCallback(async(product:Product)=>{
  if(!user){setClosingPanel(null);setAuthMode("register");setAuthError(t.loginRequired);setCaptchaToken("");setAuth(true);return;}
  if(checkoutLoading)return;
  setCheckoutLoading(true);
  trackAnalytics("checkout_start","/checkout/"+product.id);
  try{
    const csrf=await getCsrf();
    const response=await fetch("/Api/Checkout",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":csrf,"idempotency-key":crypto.randomUUID()},body:JSON.stringify({items:[{productId:product.id,quantity:1}]})});
    const data=await response.json().catch(()=>({})) as {ok?:boolean;order?:CheckoutPayment;error?:string;message?:string};
    if(!response.ok){
      const messages:Record<string,string>={payment_not_configured:"Pagamento ainda não configurado no servidor.",payment_webhook_not_configured:"Webhook de pagamento ainda não configurado no servidor.",payment_creation_uncertain:"A criação do pagamento ficou em estado incerto. Não repetimos a cobrança automaticamente.",payment_provider_error:"A Promisse recusou a cobrança.",payment_amount_mismatch:"O valor retornado pela Promisse não confere com o pedido."};
      notify("error",messages[data.error||""]||data.message||"Não foi possível criar o pagamento.");
      return;
    }
    if(!data.order)throw new Error("order_response_invalid");
    setCheckout(data.order);
    setSelected(null);
  }catch{notify("error","Não foi possível conectar ao servidor. Nenhuma cobrança foi repetida automaticamente.");}
  finally{setCheckoutLoading(false);}
},[notify,t.loginRequired,user,checkoutLoading]);
const getCsrf=async()=>{const response=await fetch("/Api/Csrf",{credentials:"same-origin",cache:"no-store"});if(!response.ok)throw new Error("csrf");const data=await response.json() as {token?:string};if(!data.token)throw new Error("csrf");return data.token};
const refreshOrder=useCallback(async()=>{
  if(!checkout||checkout.status!=="PENDING"||checkoutRefreshing)return;
  setCheckoutRefreshing(true);
  try{
    const csrf=await getCsrf();
    const response=await fetch("/Api/Orders/"+encodeURIComponent(checkout.orderId)+"/Reconcile",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"x-csrf-token":csrf}});
    const data=await response.json().catch(()=>({})) as {order?:CheckoutPayment;error?:string};
    if(data.order)setCheckout(data.order);
    if(response.status===429||data.error==="provider_rate_limited")notify("error","Muitas consultas de pagamento. Aguarde antes de tentar novamente.");
    else if(!response.ok)notify("info","O servidor não conseguiu confirmar agora. O pedido continua seguro e será necessário tentar novamente mais tarde.");
    else if(data.order?.status==="PAID")notify("success","Pagamento confirmado.");
    else if(data.order?.isVisuallyExpired)notify("info","O prazo visual terminou; o servidor ainda precisa confirmar o resultado.");
  }catch{notify("error","Não foi possível atualizar o status do pagamento agora.");}
  finally{setCheckoutRefreshing(false);}
},[checkout,checkoutRefreshing,notify]);
const submitAuth=async(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  setAuthError("");
  if(authMode==="register"){
    const password=String(form.get("password")||"");
    const confirmation=String(form.get("confirmPassword")||"");
    const passwordProblems:string[]=[];
    if(password.length<10||password.length>128)passwordProblems.push("Use uma senha com 10 a 128 caracteres.");
    if(!/[a-z]/.test(password))passwordProblems.push("Inclua pelo menos uma letra minúscula.");
    if(!/[A-Z]/.test(password))passwordProblems.push("Inclua pelo menos uma letra maiúscula.");
    if(!/[0-9]/.test(password))passwordProblems.push("Inclua pelo menos um número.");
    if(!/[^A-Za-z0-9]/.test(password))passwordProblems.push("Inclua pelo menos um símbolo.");
    if(password!==confirmation)passwordProblems.push("A confirmação da senha deve ser idêntica à senha.");
    if(passwordProblems.length){setAuthError(passwordProblems.join(" "));return;}
    if(!captchaToken){setAuthError("Conclua o hCaptcha antes de criar a conta.");return;}
  }
  setAuthLoading(true);
  try{
    const csrf=await getCsrf();
    const payload=authMode==="login"?{email:String(form.get("email")||""),password:String(form.get("password")||"")}:{username:String(form.get("username")||""),email:String(form.get("email")||""),password:String(form.get("password")||""),confirmPassword:String(form.get("confirmPassword")||""),hcaptchaToken:captchaToken};
    const response=await fetch(authMode==="login"?"/Api/Auth/Login":"/Api/Auth/Register",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":csrf},body:JSON.stringify(payload)});
    const data=await response.json().catch(()=>({})) as {user?:{id:string;username:string;email:string};message?:string;error?:string};
    if(!response.ok){const messages:Record<string,string>={rate_limited:"Muitas tentativas. Aguarde e tente novamente.",captcha_invalid:"hCaptcha recusou a verificação. Recarregue o CAPTCHA e tente novamente.",captcha_unavailable:"O serviço hCaptcha está temporariamente indisponível. Tente novamente mais tarde.",captcha_not_configured:"hCaptcha não está configurado no servidor.",captcha_misconfigured:"A configuração do hCaptcha no servidor não corresponde à chave pública. A equipe precisa corrigir a configuração.",password_invalid:"As senhas devem coincidir e a senha precisa ter 10+ caracteres, maiúscula, minúscula, número e símbolo.",registration_failed:"Este email ou nome de usuário já pode estar cadastrado. Tente entrar na conta.",registration_unavailable:"O armazenamento de contas está temporariamente indisponível. Nenhuma cobrança foi feita.",account_created_login_required:"A conta foi criada, mas não foi possível iniciar a sessão. Entre com seu email e senha.",auth_unavailable:"O serviço de autenticação está temporariamente indisponível. Tente novamente mais tarde.",invalid_request:"Confira o nome de usuário, email e campos obrigatórios.",invalid_csrf:"Sessão do formulário expirada. Recarregue a página e tente novamente.",invalid_credentials:"Email ou senha inválidos."};if(data.error==="account_created_login_required")setAuthMode("login");setAuthError(messages[data.error||""]||data.message||"Não foi possível concluir a operação. Tente novamente.");return;}
    if(data.user){setUser(data.user);setAuth(false);setCaptchaToken("");notify("success",authMode==="login"?"Bem-vindo, "+data.user.username+".":"Conta criada para "+data.user.username+".");}
  }catch{setAuthError("Não foi possível conectar ao servidor. Tente novamente.");}finally{setCaptchaToken("");setCaptchaResetSignal(value=>value+1);setAuthLoading(false);}
};
const logout=async()=>{try{const csrf=await getCsrf();await fetch("/Api/Auth/Logout",{method:"POST",credentials:"same-origin",headers:{"x-csrf-token":csrf}})}finally{setUser(null);notify("info","Sessão encerrada.");}};
const faqQuestions=faqData.length?faqData.map(item=>item.question):[t.faq1,t.faq2,t.faq3,t.faq4];
const faqAnswers=faqData.length?faqData.map(item=>item.answer):[t.answer1,t.answer2,t.answer3,t.answer4];
return <main className="site" data-theme={theme}><a className="skip-link" href="#main-content">{lang==="pt"?"Pular para o conteúdo":"Skip to content"}</a>
<header className="header">
<button className="brand" onClick={()=>navigate("home")} aria-label={t.homeLogo}>
{tab==="home" && <img className="brand-logo" src={logoSrc.src} alt="Shiny" width="34" height="34" decoding="async"/>}
<span>SHINY STORE</span>
</button>
<nav className={menuOpen?"primary-nav open":"primary-nav"} aria-label="Primary">
{([["home",t.home],["product",t.product],["faq",t.faq],["support",t.support]] as const).map(([id,label])=>
<button className={tab===id?"active":""} onClick={()=>navigate(id)} key={id} aria-current={tab===id?"page":undefined}>{label}</button>
)}
<button onClick={()=>window.location.assign("/News")}>News</button>
</nav>
<div className="header-actions">
<button className="icon-control theme-control" onClick={()=>setTheme(current=>current==="dark"?"light":"dark")} aria-label={theme==="dark"?t.dark:t.light} title={t.theme}><Icon name={theme==="dark"?"sun":"moon"}/></button>
<button className="locale-control" onClick={()=>setLang(current=>current==="pt"?"en":"pt")} aria-label={lang==="pt"?"English (United States)":"Português do Brasil"} title={t.language}><span aria-hidden="true">{lang==="pt"?"🇧🇷":"🇺🇸"}</span><span className="locale-code">{lang==="pt"?"PT":"EN"}</span></button>
{user?<button className="login-control" onClick={logout}>{user.username} · Sair</button>:<button className="login-control" onClick={()=>{setClosingPanel(null);setAuthMode("login");setAuthError("");setAuth(true)}}>{t.login}</button>}
<button className="mobile-menu-control" onClick={()=>setMenuOpen(current=>!current)} aria-label={menuOpen?t.menuClose:t.menu} aria-expanded={menuOpen}><Icon name={menuOpen?"close":"menu"}/></button>
</div>
</header>
<div className="page-shell" id="main-content">
{tab==="home" && <div className="tab-transition" key={`view-${tab}-${lang}`}><HomeExperience lang={lang} onProducts={()=>navigate("product")}/></div>}
{tab==="product" && <section className="content tab-transition" key={`view-${tab}-${lang}`}> 
<div className="section-head reveal">
<p className="eyebrow">01 / {t.product.toUpperCase()}</p><h1>{t.productTitle}</h1><p className="lead">{t.productLead}</p>
</div>
<div className="products">
{catalog.map(product=><article className="product-card" key={product.id}>
<div className="product-image"><img src={product.image||bannerSrc.src} alt="" loading="lazy" width="800" height="500"/><span>{product.name}</span><small>SHINY / DIGITAL</small></div>
<div className="product-meta"><div><h2>{product.name}</h2><p>{new Intl.NumberFormat(lang==="pt"?"pt-BR":"en-US",{style:"currency",currency:"BRL"}).format(product.price)}</p></div><div className="card-actions"><button onClick={()=>{setClosingPanel(null);setSelected(product)}}>{t.details}</button><button className="primary small" onClick={()=>handleBuy(product)} disabled={checkoutLoading}>{checkoutLoading?"…":t.buy}</button></div></div>
</article>)}
</div>
</section>}
{tab==="faq" && <section className="content faq-page tab-transition" key={`view-${tab}-${lang}`}> 
<div className="section-head reveal"><p className="eyebrow">02 / FAQ</p><h1>{t.faqTitle}</h1><p className="lead">{t.faqLead}</p></div>
<div className="faq-list">{faqQuestions.map((question,index)=><div className={openFaq===index?"faq-item open":"faq-item"} key={question}>
<button className="faq-question" onClick={()=>setOpenFaq(openFaq===index?-1:index)} aria-expanded={openFaq===index}><span>0{index+1}</span><strong>{question}</strong><b aria-hidden="true">+</b></button>
<div className="faq-answer"><div className="faq-answer-inner"><p>{faqAnswers[index]}</p></div></div>
</div>)}</div>
<div className="faq-social"><p className="eyebrow">{t.social}</p><a href="https://discord.gg/62Rb6hyJQN" target="_blank" rel="noopener noreferrer">{t.discord} ↗</a></div>
</section>}
{tab==="support" && <section className="content support-page tab-transition" key={`view-${tab}-${lang}`}> 
<div className="section-head reveal"><p className="eyebrow">03 / SUPPORT</p><h1>{t.supportTitle}</h1><p className="lead">{t.supportText}</p></div>
<div className="support-grid">
<a className="support-card" href="https://discord.gg/62Rb6hyJQN" target="_blank" rel="noopener noreferrer"><span className="support-index">01</span><strong>Discord</strong><span>discord.gg/62Rb6hyJQN ↗</span><em>{t.supportDiscord}</em></a>
<a className="support-card" href="mailto:spectrexiters@gmail.com"><span className="support-index">02</span><strong>Email</strong><span>spectrexiters@gmail.com</span><em>{t.supportEmail}</em></a>
<a className="support-card" href="/Support"><span className="support-index">03</span><strong>Ticket</strong><span>Suporte autenticado ↗</span><em>Abra e acompanhe uma solicitação diretamente pela conta.</em></a>
</div>
</section>}
</div>
<footer><span>SHINY STORE © 2026</span><span>{theme==="dark"?"DARK":"LIGHT"} / v1</span></footer>
{selected&&<div className="overlay" onMouseDown={closeSelected}>
<div className={"modal"+(closingPanel==="selected"?" is-closing":"")} role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" onMouseDown={event=>event.stopPropagation()}>
<button className="close" onClick={closeSelected} aria-label={t.close}><Icon name="close"/></button>
<p className="eyebrow">{selected.name}</p><h2 id="product-dialog-title">{selected.name}</h2><p className="lead">{selected.description}</p>
<strong>{new Intl.NumberFormat(lang==="pt"?"pt-BR":"en-US",{style:"currency",currency:"BRL"}).format(selected.price)}</strong>
<button className="primary full" onClick={()=>handleBuy(selected)} disabled={checkoutLoading}>{checkoutLoading?"Aguarde…":t.buy}</button>
</div>
</div>}

{checkout&&<div className="overlay" onMouseDown={()=>setCheckout(null)}>
<div className="modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onMouseDown={event=>event.stopPropagation()}>
<button className="close" onClick={()=>setCheckout(null)} aria-label={t.close}><Icon name="close"/></button>
<p className="eyebrow">PROMISSEPAY / PIX</p>
<h2 id="checkout-title">{orderStatusLabel(checkout.status,lang)}</h2>
<p className="lead">{checkout.message}</p>
{checkout.status==="PENDING"&&<p className="lead">A confirmação é feita pelo servidor por webhook autenticado e reconciliação manual. Esta tela não consulta a Promisse em loop.</p>}
{checkout.payment?.qrCodeBase64&&<img className="checkout-qr" src={checkout.payment.qrCodeBase64} alt="QR Code PIX para pagamento"/>}
{checkout.payment?.copyPaste&&<div className="checkout-copy"><code>{checkout.payment.copyPaste}</code><button className="primary full" onClick={()=>navigator.clipboard?.writeText(checkout.payment?.copyPaste||"").then(()=>notify("success",lang==="pt"?"Código PIX copiado.":"PIX code copied."))}>{lang==="pt"?"Copiar PIX":"Copy PIX"}</button></div>}
<div className="checkout-amount"><strong>Total: {new Intl.NumberFormat(lang==="pt"?"pt-BR":"en-US",{style:"currency",currency:checkout.currency}).format(checkout.total)}</strong>{checkout.expiresAt&&<span> · {lang==="pt"?"Prazo do QR: ":"QR expiry: "}{dateLabel(checkout.expiresAt)}</span>}</div>
<div className="checkout-details">
  <p>{lang==="pt"?"Itens: ":"Items: "}{checkout.items.map(item=>item.name+" × "+item.quantity).join(", ")}</p>
  {checkout.transactionIdMasked&&<p>{lang==="pt"?"Transação: ":"Transaction: "}{checkout.transactionIdMasked}</p>}
  <p>{lang==="pt"?"Criado: ":"Created: "}{dateLabel(checkout.createdAt)} · {lang==="pt"?"Atualizado: ":"Updated: "}{dateLabel(checkout.updatedAt)}</p>
</div>
{checkout.status==="PENDING"&&<div className="card-actions"><button className="primary full" type="button" onClick={refreshOrder} disabled={checkoutRefreshing}>{checkoutRefreshing?(lang==="pt"?"Atualizando…":"Refreshing…"):(lang==="pt"?"Atualizar status":"Refresh status")}</button></div>}
{checkout.isVisuallyExpired&&<p className="auth-error" role="status">{lang==="pt"?"O QR terminou visualmente, mas isso não confirma falha financeira.":"The visual QR deadline ended; this does not confirm a financial failure."}</p>}
<a className="text-button" href={"/?order="+encodeURIComponent(checkout.orderId)}>{lang==="pt"?"Link seguro para consultar este pedido depois":"Secure link to view this order later"}</a>
</div>
</div>}
{auth&&<div className="overlay" onMouseDown={closeAuth}>
<form className={"modal auth"+(closingPanel==="auth"?" is-closing":"")} role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={event=>event.stopPropagation()} onSubmit={submitAuth}>
<button type="button" className="close" onClick={closeAuth} aria-label={t.close}><Icon name="close"/></button>
<p className="eyebrow">SHINY ACCOUNT</p><h2 id="auth-title">{authMode==="login"?t.signIn:t.signUp}</h2>
{authMode==="register"&&<label>Nome de usuário <input name="username" required minLength={3} maxLength={32} autoComplete="username" placeholder="username"/></label>}
<label>Email <input name="email" required maxLength={254} autoComplete="email" inputMode="email" placeholder="Email"/></label>
<label>{lang==="pt"?"Senha":"Password"} <input name="password" required minLength={10} maxLength={128} autoComplete={authMode==="login"?"current-password":"new-password"} placeholder={lang==="pt"?"Senha":"Password"} type="password"/></label>
{authMode==="register"&&<><label>Confirmar senha <input name="confirmPassword" required minLength={10} maxLength={128} autoComplete="new-password" placeholder="Confirmar senha" type="password"/></label><HCaptchaWidget onToken={setCaptchaToken} theme="auto" resetSignal={captchaResetSignal}/></>}
{authError&&<p className="auth-error" role="alert">{authError}</p>}
<button className="primary full" disabled={authLoading}>{authLoading?"Aguarde…":authMode==="login"?t.signIn:t.signUp}</button>
<div className="auth-links">{authMode==="login"?<><button type="button" className="text-button" onClick={()=>{setAuthMode("register");setAuthError("");setCaptchaToken("")}}>{t.signUp}</button><a className="text-button" href="https://discord.gg/62Rb6hyJQN" target="_blank" rel="noopener noreferrer">Esqueceu a senha? Suporte ↗</a></>:<button type="button" className="text-button" onClick={()=>{setAuthMode("login");setAuthError("");setCaptchaToken("")}}>Já tenho uma conta</button>}</div>
</form>
</div>}
<div className="toast-stack" aria-live="polite" aria-atomic="false">{notices.map(notice=><div className={"toast "+notice.kind+(notice.removing?" is-removing":"")} key={notice.id}><span>{notice.kind==="success"?"✓":notice.kind==="error"?"×":notice.kind==="warning"?"!":"i"}</span><p>{notice.text}</p><button onClick={()=>closeNotice(notice.id)} aria-label={t.close}>×</button></div>)}</div>
</main>;
}