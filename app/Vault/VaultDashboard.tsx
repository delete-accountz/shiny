"use client";

import {useEffect,useMemo,useState} from "react";
import type {AdminCustomer,AdminLog,AdminProduct} from "@/Lib/ADMIN_DATA";

type SectionId="overview"|"orders"|"products"|"customers"|"finance"|"coupons"|"posts"|"support"|"faq"|"analytics"|"logs"|"webhooks"|"settings";
type Toast={kind:"success"|"error"|"info";text:string};
type ProductForm={name:string;price:string;description:string;image:string;active:boolean;stock:string;category:string;tags:string};
type CouponView={id:string;code:string;type:"percent"|"fixed";value:number;startsAt?:string;expiresAt?:string;usageLimit?:number;usedCount:number;minimumAmount:number;productIds:string[];category?:string;customerId?:string;active:boolean;createdAt:string;updatedAt:string};
type CouponForm={code:string;type:"percent"|"fixed";value:string;startsAt:string;expiresAt:string;usageLimit:string;minimumAmount:string;productIds:string;category:string;customerId:string;active:boolean};
type WebhookView={id:string;name:string;url:string;method:"POST"|"PUT"|"PATCH";events:string[];active:boolean;secretConfigured:boolean;headers:string[];createdAt:string;updatedAt:string};
type WebhookDelivery={id:string;webhookId:string;event:string;status:"success"|"failed";statusCode?:number;durationMs:number;attempts:number;error?:string;at:string};
type WebhookForm={name:string;url:string;method:"POST"|"PUT"|"PATCH";events:string[];active:boolean;secret:string;headers:string};
type PostView={id:string;slug:string;title:string;summary:string;content:string;image?:string;category:string;status:"draft"|"published"|"scheduled";publishedAt?:string;scheduledAt?:string;seoTitle?:string;seoDescription?:string;createdAt:string;updatedAt:string};
type PostForm={title:string;slug:string;summary:string;content:string;image:string;category:string;status:"draft"|"published"|"scheduled";scheduledAt:string;seoTitle:string;seoDescription:string};
type FaqView={id:string;question:string;answer:string;category:string;active:boolean;order:number;createdAt:string;updatedAt:string};
type FaqForm={question:string;answer:string;category:string;active:boolean;order:string};
type TicketView={id:string;userId:string;subject:string;message:string;status:"open"|"in_progress"|"resolved";adminReply?:string;createdAt:string;updatedAt:string};
type AnalyticsSummary={days:number;total:number;byEvent:Record<string,number>;topPages:{path:string;count:number}[]};
type AdminOrderView={
  id:string;
  status:"PENDING"|"PAID"|"FAILED"|"CANCELLED"|"EXPIRED";
  paymentStatus?:"pending"|"PAID"|"payment.failed";
  total:number;
  items:{name:string;quantity:number}[];
  transactionIdMasked?:string;
  createdAt:string;
  updatedAt:string;
  expiresAt?:string;
  stockReservationQuantity:number;
  couponReserved:boolean;
  needsReconciliation:boolean;
  lastReconciliationAt?:string;
  lastReconciliationError?:string;
};
type AdminOrderMetrics={
  total:number;pending:number;paid:number;failed:number;cancelled:number;expired:number;revenue:number;
  ordersWithStockReservation:number;pendingStockUnits:number;ordersWithCouponReservation:number;
  unassociatedTransactions:number;reconciliationErrors:number;
  lastValidWebhook:AdminLog|null;lastRejectedWebhook:AdminLog|null;lastReconciliationAt:string|null;
};

type ReconciliationSnapshot={queue:unknown[];pendingWebhooks:unknown[];alerts:unknown[]};
type AdminData={
  reconciliation:ReconciliationSnapshot;
  products:AdminProduct[];
  customers:AdminCustomer[];
  logs:AdminLog[];
  hcaptchaConfigured:boolean;
  paymentsConfigured:boolean;
  promiseBaseConfigured:boolean;
  promiseApiKeyConfigured:boolean;
  promiseWebhookConfigured:boolean;
  promiseWebhookSecretConfigured:boolean;
  promiseMode:"production"|"incomplete";
  promiseSandboxDocumented:boolean;
  promiseLastError:AdminLog|null;
  promiseLastReconciliationAt:string|null;
  orders:AdminOrderView[];
  orderMetrics:AdminOrderMetrics;
};

const sections=[
  {id:"overview",label:"Overview",group:"Operação",short:"01"},
  {id:"orders",label:"Pedidos",group:"Operação",short:"02"},
  {id:"products",label:"Produtos",group:"Operação",short:"03"},
  {id:"customers",label:"Clientes",group:"Operação",short:"04"},
  {id:"finance",label:"Financeiro",group:"Operação",short:"05"},
  {id:"coupons",label:"Cupons",group:"Conteúdo",short:"06"},
  {id:"posts",label:"Posts / News",group:"Conteúdo",short:"07"},
  {id:"support",label:"Suporte",group:"Conteúdo",short:"08"},
  {id:"faq",label:"FAQ",group:"Conteúdo",short:"09"},
  {id:"analytics",label:"Analytics",group:"Inteligência",short:"10"},
  {id:"logs",label:"Logs",group:"Inteligência",short:"11"},
  {id:"webhooks",label:"Webhooks",group:"Inteligência",short:"12"},
  {id:"settings",label:"Configurações",group:"Inteligência",short:"13"}
] as const;

const sectionIds=sections.map(item=>item.id) as SectionId[];

function money(value:number){
  return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value);
}

function dateTime(value:string){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(date);
}

function csvCell(value:unknown){
  const text=String(value??"");
  return /[",\n\r;]/.test(text)?'="'+text.replace(/"/g,'""')+'"':text;
}

function downloadCsv(filename:string,rows:string[][]){
  const body=rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
  const blob=new Blob([body],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download=filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function StatusTag({ok,label}:{ok:boolean;label?:string}){
  return <span className={"vault2-status "+(ok?"is-ok":"is-muted")}><span aria-hidden="true"/> {label||(ok?"Configurado":"Ainda não configurado")}</span>;
}

function EmptyState({title="Nenhum dado disponível",text,code=false}:{title?:string;text:string;code?:boolean}){
  return <div className="vault2-empty">
    <span className="vault2-empty-mark" aria-hidden="true">{code?"—":"∅"}</span>
    <strong>{title}</strong>
    <p>{text}</p>
  </div>;
}

function SectionIntro({number,title,description}:{number:string;title:string;description:string}){
  return <div className="vault2-section-intro">
    <div>
      <p className="vault2-kicker">{number} / SHINY ADMIN</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  </div>;
}

function Unsupported({title,description,note}:{title:string;description:string;note?:string}){
  return <section className="vault2-page">
    <SectionIntro number={sections.find(item=>item.label===title)?.short||"—"} title={title} description={description}/>
    <div className="vault2-workspace">
      <div className="vault2-unsupported">
        <div className="vault2-unsupported-icon" aria-hidden="true">◌</div>
        <StatusTag ok={false} label="Ainda não configurado"/>
        <h2>Ainda não configurado</h2>
        <p>{note||"Não existe backend, persistência ou API administrativa real para esta área neste projeto."}</p>
        <small>Nenhuma ação foi habilitada para evitar uma interface que pareça executar operações sem suporte real.</small>
      </div>
    </div>
  </section>;
}

export default function VaultDashboard({data}:{data:AdminData}){
  const [active,setActive]=useState<SectionId>("overview");
  const [query,setQuery]=useState("");
  const [collapsed,setCollapsed]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [loggingOut,setLoggingOut]=useState(false);
  const [toast,setToast]=useState<Toast|null>(null);
  const [customerQuery,setCustomerQuery]=useState("");
  const [logQuery,setLogQuery]=useState("");
  const [logResource,setLogResource]=useState("");
  const [logResult,setLogResult]=useState("");
  const [logFrom,setLogFrom]=useState("");
  const [logTo,setLogTo]=useState("");
  const [products,setProducts]=useState<AdminProduct[]>(data.products);
  const [productEditor,setProductEditor]=useState<"create"|AdminProduct|null>(null);
  const [productSaving,setProductSaving]=useState(false);
  const [productDeleting,setProductDeleting]=useState<string|null>(null);
  const [productForm,setProductForm]=useState<ProductForm>({name:"",price:"",description:"",image:"",active:true,stock:"0",category:"",tags:""});
  const [coupons,setCoupons]=useState<CouponView[]>([]);
  const [couponsLoaded,setCouponsLoaded]=useState(false);
  const [couponEditor,setCouponEditor]=useState<"create"|CouponView|null>(null);
  const [couponSaving,setCouponSaving]=useState(false);
  const [couponDeleting,setCouponDeleting]=useState<string|null>(null);
  const [couponForm,setCouponForm]=useState<CouponForm>({code:"",type:"percent",value:"",startsAt:"",expiresAt:"",usageLimit:"",minimumAmount:"0",productIds:"",category:"",customerId:"",active:true});
  const [webhooks,setWebhooks]=useState<WebhookView[]>([]);
  const [webhookEvents,setWebhookEvents]=useState<string[]>([]);
  const [webhooksLoaded,setWebhooksLoaded]=useState(false);
  const [webhookEditor,setWebhookEditor]=useState<"create"|WebhookView|null>(null);
  const [webhookSaving,setWebhookSaving]=useState(false);
  const [webhookDeleting,setWebhookDeleting]=useState<string|null>(null);
  const [webhookTesting,setWebhookTesting]=useState<string|null>(null);
  const [webhookDeliveries,setWebhookDeliveries]=useState<Record<string,WebhookDelivery[]>>({});
  const [webhookForm,setWebhookForm]=useState<WebhookForm>({name:"",url:"",method:"POST",events:[],active:true,secret:"",headers:""});
  const [posts,setPosts]=useState<PostView[]>([]);
  const [postsLoaded,setPostsLoaded]=useState(false);
  const [postEditor,setPostEditor]=useState<"create"|PostView|null>(null);
  const [postPreview,setPostPreview]=useState(false);
  const [postSaving,setPostSaving]=useState(false);
  const [postDeleting,setPostDeleting]=useState<string|null>(null);
  const [postForm,setPostForm]=useState<PostForm>({title:"",slug:"",summary:"",content:"",image:"",category:"",status:"draft",scheduledAt:"",seoTitle:"",seoDescription:""});
  const [faqItems,setFaqItems]=useState<FaqView[]>([]);
  const [faqLoaded,setFaqLoaded]=useState(false);
  const [faqEditor,setFaqEditor]=useState<"create"|FaqView|null>(null);
  const [faqSaving,setFaqSaving]=useState(false);
  const [faqDeleting,setFaqDeleting]=useState<string|null>(null);
  const [faqForm,setFaqForm]=useState<FaqForm>({question:"",answer:"",category:"Geral",active:true,order:"0"});
  const [tickets,setTickets]=useState<TicketView[]>([]);
  const [ticketsLoaded,setTicketsLoaded]=useState(false);
  const [ticketSaving,setTicketSaving]=useState<string|null>(null);
  const [ticketReply,setTicketReply]=useState<Record<string,string>>({});
  const [analytics,setAnalytics]=useState<AnalyticsSummary|null>(null);
  const [orders,setOrders]=useState<AdminOrderView[]>(data.orders);
  const [orderMetrics,setOrderMetrics]=useState<AdminOrderMetrics>(data.orderMetrics);
  const [ordersLoading,setOrdersLoading]=useState(false);
  const [reconcilingOrders,setReconcilingOrders]=useState(false);

  useEffect(()=>{
    const syncHash=()=>{
      const candidate=window.location.hash.replace("#","") as SectionId;
      if(sectionIds.includes(candidate))setActive(candidate);
    };
    syncHash();
    window.addEventListener("hashchange",syncHash);
    return()=>window.removeEventListener("hashchange",syncHash);
  },[]);

  useEffect(()=>{
    if(!toast)return;
    const timer=window.setTimeout(()=>setToast(null),4200);
    return()=>window.clearTimeout(timer);
  },[toast]);

  useEffect(()=>{
    if(active!=="coupons"||couponsLoaded)return;
    fetch("/Api/Admin/Coupons",{credentials:"same-origin",cache:"no-store"})
      .then(async response=>({ok:response.ok,payload:await response.json().catch(()=>({})) as {coupons?:CouponView[]}}))
      .then(result=>{
        if(!result.ok||!Array.isArray(result.payload.coupons)){setToast({kind:"error",text:"Não foi possível carregar os cupons."});return;}
        setCoupons(result.payload.coupons);setCouponsLoaded(true);
      }).catch(()=>setToast({kind:"error",text:"Não foi possível carregar os cupons."}));
  },[active,couponsLoaded]);

  useEffect(()=>{
    if(active!=="webhooks"||webhooksLoaded)return;
    fetch("/Api/Admin/Webhooks",{credentials:"same-origin",cache:"no-store"})
      .then(async response=>({ok:response.ok,payload:await response.json().catch(()=>({})) as {webhooks?:WebhookView[];events?:string[]}}))
      .then(result=>{
        if(!result.ok||!Array.isArray(result.payload.webhooks)){setToast({kind:"error",text:"Não foi possível carregar os webhooks."});return;}
        setWebhooks(result.payload.webhooks);setWebhookEvents(result.payload.events||[]);setWebhooksLoaded(true);
      }).catch(()=>setToast({kind:"error",text:"Não foi possível carregar os webhooks."}));
  },[active,webhooksLoaded]);

  useEffect(()=>{
    if(active!=="posts"||postsLoaded)return;
    fetch("/Api/Admin/Posts",{credentials:"same-origin",cache:"no-store"})
      .then(async response=>({ok:response.ok,payload:await response.json().catch(()=>({})) as {posts?:PostView[]}}))
      .then(result=>{
        if(!result.ok||!Array.isArray(result.payload.posts)){setToast({kind:"error",text:"Não foi possível carregar os posts."});return;}
        setPosts(result.payload.posts);setPostsLoaded(true);
      }).catch(()=>setToast({kind:"error",text:"Não foi possível carregar os posts."}));
  },[active,postsLoaded]);

  useEffect(()=>{
    if(active!=="faq"||faqLoaded)return;
    fetch("/Api/Admin/FAQ",{credentials:"same-origin",cache:"no-store"})
      .then(async response=>({ok:response.ok,payload:await response.json().catch(()=>({})) as {faq?:FaqView[]}}))
      .then(result=>{
        if(!result.ok||!Array.isArray(result.payload.faq)){setToast({kind:"error",text:"Não foi possível carregar o FAQ."});return;}
        setFaqItems(result.payload.faq);setFaqLoaded(true);
      }).catch(()=>setToast({kind:"error",text:"Não foi possível carregar o FAQ."}));
  },[active,faqLoaded]);

  useEffect(()=>{
    if(active!=="analytics")return;
    fetch("/Api/Analytics?days=30",{credentials:"same-origin",cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error("analytics");return await response.json() as AnalyticsSummary}).then(setAnalytics).catch(()=>setAnalytics(null));
  },[active]);

  useEffect(()=>{
    if(active!=="support"||ticketsLoaded)return;
    fetch("/Api/Admin/Support",{credentials:"same-origin",cache:"no-store"})
      .then(async response=>({ok:response.ok,payload:await response.json().catch(()=>({})) as {tickets?:TicketView[]}}))
      .then(result=>{
        if(!result.ok||!Array.isArray(result.payload.tickets)){setToast({kind:"error",text:"Não foi possível carregar os tickets."});return;}
        setTickets(result.payload.tickets);setTicketsLoaded(true);
      }).catch(()=>setToast({kind:"error",text:"Não foi possível carregar os tickets."}));
  },[active,ticketsLoaded]);

  useEffect(()=>{
    if(active!=="orders"||ordersLoading)return;
    loadAdminOrders();
  },[active]);
  
  const filteredSections=useMemo(()=>{
    const normalized=query.trim().toLowerCase();
    if(!normalized)return sections;
    return sections.filter(item=>(item.label+" "+item.group).toLowerCase().includes(normalized));
  },[query]);

  const filteredCustomers=useMemo(()=>{
    const normalized=customerQuery.trim().toLowerCase();
    if(!normalized)return data.customers;
    return data.customers.filter(item=>[item.username,item.email].some(value=>value.toLowerCase().includes(normalized)));
  },[data.customers,customerQuery]);

  const filteredLogs=useMemo(()=>{
    const action=logQuery.trim().toLowerCase();const resource=logResource.trim().toLowerCase();const result=logResult.trim().toLowerCase();
    return data.logs.filter(item=>{
      if(action&&!item.event.toLowerCase().includes(action)&&!item.actor.toLowerCase().includes(action))return false;
      if(resource&&!item.resource.toLowerCase().includes(resource))return false;
      if(result&&item.result.toLowerCase()!==result)return false;
      const time=Date.parse(item.at);if(logFrom&&(!Number.isNaN(time)&&time<Date.parse(logFrom)))return false;if(logTo&&(!Number.isNaN(time)&&time>Date.parse(logTo)+86_399_999))return false;
      return true;
    });
  },[data.logs,logQuery,logResource,logResult,logFrom,logTo]);

  async function loadAdminOrders(){
    if(ordersLoading)return;
    setOrdersLoading(true);
    try{
      const response=await fetch("/Api/Admin/Orders",{credentials:"same-origin",cache:"no-store"});
      const payload=await response.json().catch(()=>({})) as {orders?:AdminOrderView[];metrics?:AdminOrderMetrics};
      if(!response.ok||!Array.isArray(payload.orders)||!payload.metrics)throw new Error("orders_load");
      setOrders(payload.orders);setOrderMetrics(payload.metrics);
    }catch{setToast({kind:"error",text:"Não foi possível carregar os pedidos."});}
    finally{setOrdersLoading(false);}
  }

  async function reconcileAdminOrders(){
    if(reconcilingOrders)return;
    setReconcilingOrders(true);
    try{
      const csrf=await adminCsrf();
      const response=await fetch("/Api/Admin/Orders/Reconcile",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"x-csrf-token":csrf}});
      const payload=await response.json().catch(()=>({})) as {data?:{orders?:AdminOrderView[];metrics?:AdminOrderMetrics};error?:string};
      if(!response.ok||!payload.data?.orders||!payload.data.metrics)throw new Error(payload.error||"reconcile");
      setOrders(payload.data.orders);setOrderMetrics(payload.data.metrics);
      setToast({kind:"success",text:"Reconciliação server-side concluída para os pedidos elegíveis."});
    }catch(error){
      setToast({kind:"error",text:error instanceof Error&&error.message==="rate_limited"?"Reconciliação temporariamente limitada. Aguarde.":"Não foi possível concluir a reconciliação."});
    }finally{setReconcilingOrders(false);}
  }

  const goTo=(id:SectionId)=>{
    setActive(id);
    setQuery("");
    setMobileOpen(false);
    window.history.replaceState(null,"","/Vault#"+id);
  };

  async function logout(){
    if(loggingOut)return;
    setLoggingOut(true);
    try{
      const csrfResponse=await fetch("/Api/Csrf",{credentials:"same-origin",cache:"no-store"});
      const csrfPayload=await csrfResponse.json().catch(()=>({})) as {token?:string};
      if(!csrfResponse.ok||!csrfPayload.token)throw new Error("csrf");
      const response=await fetch("/Api/Admin/Logout",{
        method:"POST",
        credentials:"same-origin",
        cache:"no-store",
        headers:{"x-csrf-token":csrfPayload.token}
      });
      if(!response.ok)throw new Error("logout");
      window.location.assign("/Vault");
    }catch{
      setLoggingOut(false);
      setToast({kind:"error",text:"Não foi possível encerrar a sessão administrativa."});
    }
  }

  function openProductEditor(product:"create"|AdminProduct){
    setProductEditor(product);
    if(product==="create"){
      setProductForm({name:"",price:"",description:"",image:"",active:true,stock:"0",category:"",tags:""});
      return;
    }
    setProductForm({
      name:product.name,
      price:String(product.price),
      description:product.description,
      image:product.image||"",
      active:product.active!==false,
      stock:String(product.stock??0),
      category:product.category||"",
      tags:(product.tags||[]).join(", ")
    });
  }

  async function adminCsrf(){
    const response=await fetch("/Api/Csrf",{credentials:"same-origin",cache:"no-store"});
    const payload=await response.json().catch(()=>({})) as {token?:string};
    if(!response.ok||!payload.token)throw new Error("csrf");
    return payload.token;
  }

  async function saveProduct(){
    if(productSaving||!productEditor)return;
    const price=Number(productForm.price);
    const stock=Number(productForm.stock);
    if(!productForm.name.trim()||!Number.isFinite(price)||price<0||!Number.isInteger(stock)||stock<0){
      setToast({kind:"error",text:"Preencha nome, preço e estoque com valores válidos."});
      return;
    }
    setProductSaving(true);
    try{
      const csrf=await adminCsrf();
      const payload={
        name:productForm.name.trim(),
        price,
        description:productForm.description.trim(),
        image:productForm.image.trim(),
        active:productForm.active,
        stock,
        category:productForm.category.trim(),
        tags:productForm.tags.split(",").map(tag=>tag.trim()).filter(Boolean)
      };
      const isCreate=productEditor==="create";
      const endpoint=isCreate?"/Api/Admin/Products":"/Api/Admin/Products/"+encodeURIComponent(productEditor.id);
      const response=await fetch(endpoint,{
        method:isCreate?"POST":"PUT",
        credentials:"same-origin",
        headers:{"content-type":"application/json","x-csrf-token":csrf},
        body:JSON.stringify(payload)
      });
      const result=await response.json().catch(()=>({})) as {ok?:boolean;product?:AdminProduct;error?:string};
      if(!response.ok||!result.product)throw new Error(result.error||"save_failed");
      setProducts(current=>isCreate?[...current,result.product!]:current.map(item=>item.id===result.product!.id?result.product!:item));
      setProductEditor(null);
      setToast({kind:"success",text:isCreate?"Produto criado.":"Produto atualizado."});
    }catch(error){
      const code=error instanceof Error?error.message:"";
      setToast({kind:"error",text:code==="invalid_csrf"?"A validação de segurança expirou.":code==="rate_limited"?"Muitas tentativas. Aguarde um momento.":"Não foi possível salvar o produto."});
    }finally{setProductSaving(false);}
  }

  async function removeProduct(product:AdminProduct){
    if(productDeleting)return;
    if(!window.confirm("Excluir o produto “"+product.name+"”? Esta ação não pode ser desfeita."))return;
    setProductDeleting(product.id);
    try{
      const csrf=await adminCsrf();
      const response=await fetch("/Api/Admin/Products/"+encodeURIComponent(product.id),{
        method:"DELETE",
        credentials:"same-origin",
        headers:{"x-csrf-token":csrf}
      });
      const result=await response.json().catch(()=>({})) as {ok?:boolean;error?:string};
      if(!response.ok||result.ok!==true)throw new Error(result.error||"delete_failed");
      setProducts(current=>current.filter(item=>item.id!==product.id));
      setToast({kind:"success",text:"Produto excluído."});
    }catch{
      setToast({kind:"error",text:"Não foi possível excluir o produto."});
    }finally{setProductDeleting(null);}
  }

  function openCouponEditor(coupon:"create"|CouponView){
    setCouponEditor(coupon);
    if(coupon==="create"){
      setCouponForm({code:"",type:"percent",value:"",startsAt:"",expiresAt:"",usageLimit:"",minimumAmount:"0",productIds:"",category:"",customerId:"",active:true});
      return;
    }
    setCouponForm({code:coupon.code,type:coupon.type,value:String(coupon.value),startsAt:coupon.startsAt?.slice(0,16)||"",expiresAt:coupon.expiresAt?.slice(0,16)||"",usageLimit:coupon.usageLimit===undefined?"":String(coupon.usageLimit),minimumAmount:String(coupon.minimumAmount),productIds:coupon.productIds.join(", "),category:coupon.category||"",customerId:coupon.customerId||"",active:coupon.active});
  }

  async function saveCoupon(){
    if(couponSaving||!couponEditor)return;
    const value=Number(couponForm.value),minimumAmount=Number(couponForm.minimumAmount||0);
    const usageLimit=couponForm.usageLimit?Number(couponForm.usageLimit):undefined;
    if(!/^[A-Za-z0-9_-]{3,40}$/.test(couponForm.code.trim())||!Number.isFinite(value)||value<=0||!Number.isFinite(minimumAmount)||minimumAmount<0||(usageLimit!==undefined&&(!Number.isInteger(usageLimit)||usageLimit<=0))){
      setToast({kind:"error",text:"Preencha código, desconto, mínimo e limite com valores válidos."});return;
    }
    if(couponForm.type==="percent"&&value>100){setToast({kind:"error",text:"O percentual não pode exceder 100%."});return;}
    setCouponSaving(true);
    try{
      const csrf=await adminCsrf();
      const toIso=(value:string)=>value?new Date(value).toISOString():undefined;
      const payload={code:couponForm.code.trim().toUpperCase(),type:couponForm.type,value,startsAt:toIso(couponForm.startsAt),expiresAt:toIso(couponForm.expiresAt),usageLimit,minimumAmount,productIds:couponForm.productIds.split(",").map(item=>item.trim()).filter(Boolean),category:couponForm.category.trim(),customerId:couponForm.customerId.trim(),active:couponForm.active};
      const isCreate=couponEditor==="create";
      const endpoint=isCreate?"/Api/Admin/Coupons":"/Api/Admin/Coupons/"+encodeURIComponent(couponEditor.id);
      const response=await fetch(endpoint,{method:isCreate?"POST":"PUT",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":csrf},body:JSON.stringify(payload)});
      const result=await response.json().catch(()=>({})) as {ok?:boolean;coupon?:CouponView;error?:string};
      if(!response.ok||!result.coupon)throw new Error(result.error||"save_failed");
      setCoupons(current=>isCreate?[...current,result.coupon!]:current.map(item=>item.id===result.coupon!.id?result.coupon!:item));
      setCouponEditor(null);setCouponsLoaded(true);setToast({kind:"success",text:isCreate?"Cupom criado.":"Cupom atualizado."});
    }catch(error){setToast({kind:"error",text:error instanceof Error&&error.message==="duplicate_code"?"Código já utilizado.":"Não foi possível salvar o cupom."});}
    finally{setCouponSaving(false);}
  }

  async function removeCoupon(coupon:CouponView){
    if(couponDeleting)return;
    if(!window.confirm("Excluir o cupom “"+coupon.code+"”? Esta ação não pode ser desfeita."))return;
    setCouponDeleting(coupon.id);
    try{
      const csrf=await adminCsrf();
      const response=await fetch("/Api/Admin/Coupons/"+encodeURIComponent(coupon.id),{method:"DELETE",credentials:"same-origin",headers:{"x-csrf-token":csrf}});
      const result=await response.json().catch(()=>({})) as {ok?:boolean};
      if(!response.ok||result.ok!==true)throw new Error("delete_failed");
      setCoupons(current=>current.filter(item=>item.id!==coupon.id));setToast({kind:"success",text:"Cupom excluído."});
    }catch{setToast({kind:"error",text:"Não foi possível excluir o cupom."});}
    finally{setCouponDeleting(null);}
  }

  function couponStatus(coupon:CouponView){
    if(!coupon.active)return "Inativo";
    if(coupon.expiresAt&&new Date(coupon.expiresAt)<new Date())return "Expirado";
    if(coupon.usageLimit!==undefined&&coupon.usedCount>=coupon.usageLimit)return "Esgotado";
    if(coupon.startsAt&&new Date(coupon.startsAt)>new Date())return "Agendado";
    return "Ativo";
  }

  function openWebhookEditor(webhook:"create"|WebhookView){
    setWebhookEditor(webhook);
    if(webhook==="create"){
      setWebhookForm({name:"",url:"",method:"POST",events:webhookEvents.slice(0,1),active:true,secret:"",headers:""});
      return;
    }
    setWebhookForm({name:webhook.name,url:webhook.url,method:webhook.method,events:webhook.events,active:webhook.active,secret:"",headers:""});
  }

  async function saveWebhook(){
    if(webhookSaving||!webhookEditor)return;
    if(!webhookForm.name.trim()||!webhookForm.url.trim()||webhookForm.events.length===0){setToast({kind:"error",text:"Preencha nome, URL e ao menos um evento."});return;}
    if(webhookEditor==="create"&&webhookForm.secret.length<16){setToast({kind:"error",text:"O segredo precisa ter pelo menos 16 caracteres."});return;}
    const headers:Record<string,string>={};
    for(const line of webhookForm.headers.split(/\r?\n/).map(item=>item.trim()).filter(Boolean)){
      const separator=line.indexOf(":");
      if(separator<1){setToast({kind:"error",text:"Headers devem usar o formato Nome: valor, um por linha."});return;}
      const name=line.slice(0,separator).trim();const value=line.slice(separator+1).trim();
      if(!/^[A-Za-z0-9-]{1,64}$/.test(name)||!value){setToast({kind:"error",text:"Header inválido."});return;}
      headers[name]=value;
    }
    setWebhookSaving(true);
    try{
      const csrf=await adminCsrf();
      const payload={name:webhookForm.name.trim(),url:webhookForm.url.trim(),method:webhookForm.method,events:webhookForm.events,active:webhookForm.active,secret:webhookForm.secret,headers};
      const isCreate=webhookEditor==="create";
      const endpoint=isCreate?"/Api/Admin/Webhooks":"/Api/Admin/Webhooks/"+encodeURIComponent(webhookEditor.id);
      const response=await fetch(endpoint,{method:isCreate?"POST":"PUT",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":csrf},body:JSON.stringify(payload)});
      const result=await response.json().catch(()=>({})) as {ok?:boolean;webhook?:WebhookView;error?:string};
      if(!response.ok||!result.webhook)throw new Error(result.error||"save_failed");
      setWebhooks(current=>isCreate?[...current,result.webhook!]:current.map(item=>item.id===result.webhook!.id?result.webhook!:item));
      setWebhookEditor(null);setWebhooksLoaded(true);setToast({kind:"success",text:isCreate?"Webhook criado.":"Webhook atualizado."});
    }catch(error){
      const code=error instanceof Error?error.message:"";
      const messages:Record<string,string>={https_required:"Use uma URL HTTPS.",private_host:"URL aponta para rede privada ou host local.",credentials_not_allowed:"A URL não pode conter usuário ou senha.",invalid_url:"URL inválida.",invalid_event:"Evento inválido.",rate_limited:"Muitas tentativas. Aguarde."};
      setToast({kind:"error",text:messages[code]||"Não foi possível salvar o webhook."});
    }finally{setWebhookSaving(false);}
  }

  async function removeWebhook(webhook:WebhookView){
    if(webhookDeleting)return;
    if(!window.confirm("Excluir o webhook “"+webhook.name+"”? O histórico será preservado."))return;
    setWebhookDeleting(webhook.id);
    try{
      const csrf=await adminCsrf();
      const response=await fetch("/Api/Admin/Webhooks/"+encodeURIComponent(webhook.id),{method:"DELETE",credentials:"same-origin",headers:{"x-csrf-token":csrf}});
      const result=await response.json().catch(()=>({})) as {ok?:boolean};
      if(!response.ok||result.ok!==true)throw new Error("delete_failed");
      setWebhooks(current=>current.filter(item=>item.id!==webhook.id));setToast({kind:"success",text:"Webhook excluído."});
    }catch{setToast({kind:"error",text:"Não foi possível excluir o webhook."});}
    finally{setWebhookDeleting(null);}
  }

  async function testWebhook(webhook:WebhookView){
    if(webhookTesting)return;
    const event=webhook.events[0];if(!event)return;
    setWebhookTesting(webhook.id);
    try{
      const csrf=await adminCsrf();
      const response=await fetch("/Api/Admin/Webhooks/"+encodeURIComponent(webhook.id)+"/Test",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":csrf},body:JSON.stringify({event})});
      const result=await response.json().catch(()=>({})) as {ok?:boolean;delivery?:WebhookDelivery};
      if(result.delivery){setWebhookDeliveries(current=>({...current,[webhook.id]:[result.delivery!,...(current[webhook.id]||[])].slice(0,10)}));}
      if(!response.ok||!result.delivery){setToast({kind:"error",text:"O teste do webhook falhou."});return;}
      setToast({kind:"success",text:"Webhook respondeu com HTTP "+(result.delivery.statusCode||"—")+" em "+result.delivery.durationMs+" ms."});
    }catch{setToast({kind:"error",text:"Não foi possível executar o teste do webhook."});}
    finally{setWebhookTesting(null);}
  }

  function openPostEditor(post:"create"|PostView){
    setPostEditor(post);setPostPreview(false);
    if(post==="create"){setPostForm({title:"",slug:"",summary:"",content:"",image:"",category:"",status:"draft",scheduledAt:"",seoTitle:"",seoDescription:""});return;}
    setPostForm({title:post.title,slug:post.slug,summary:post.summary,content:post.content,image:post.image||"",category:post.category,status:post.status,scheduledAt:post.scheduledAt?.slice(0,16)||"",seoTitle:post.seoTitle||"",seoDescription:post.seoDescription||""});
  }

  async function savePost(){
    if(postSaving||!postEditor)return;
    if(!postForm.title.trim()||!postForm.content.trim()||!postForm.category.trim()){setToast({kind:"error",text:"Título, conteúdo e categoria são obrigatórios."});return;}
    if(/[<>]/.test(postForm.title+postForm.summary+postForm.content+postForm.category)){setToast({kind:"error",text:"HTML não é permitido no conteúdo. Use texto simples."});return;}
    if(postForm.status==="scheduled"&&!postForm.scheduledAt){setToast({kind:"error",text:"Informe a data de agendamento."});return;}
    setPostSaving(true);
    try{
      const csrf=await adminCsrf();
      const payload={...postForm,title:postForm.title.trim(),slug:postForm.slug.trim(),summary:postForm.summary.trim(),content:postForm.content.trim(),image:postForm.image.trim(),category:postForm.category.trim(),scheduledAt:postForm.scheduledAt?new Date(postForm.scheduledAt).toISOString():undefined,seoTitle:postForm.seoTitle.trim(),seoDescription:postForm.seoDescription.trim()};
      const isCreate=postEditor==="create";const endpoint=isCreate?"/Api/Admin/Posts":"/Api/Admin/Posts/"+encodeURIComponent(postEditor.id);
      const response=await fetch(endpoint,{method:isCreate?"POST":"PUT",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":csrf},body:JSON.stringify(payload)});
      const result=await response.json().catch(()=>({})) as {ok?:boolean;post?:PostView;error?:string};
      if(!response.ok||!result.post)throw new Error(result.error||"save_failed");
      setPosts(current=>isCreate?[...current,result.post!]:current.map(item=>item.id===result.post!.id?result.post!:item));setPostEditor(null);setPostPreview(false);setToast({kind:"success",text:isCreate?"Post criado.":"Post atualizado."});
    }catch(error){setToast({kind:"error",text:error instanceof Error&&error.message==="duplicate_slug"?"Slug já utilizado.":"Não foi possível salvar o post."});}
    finally{setPostSaving(false);}
  }

  async function removePost(post:PostView){
    if(postDeleting)return;
    if(!window.confirm("Excluir o post “"+post.title+"”? Esta ação não pode ser desfeita."))return;
    setPostDeleting(post.id);
    try{
      const csrf=await adminCsrf();const response=await fetch("/Api/Admin/Posts/"+encodeURIComponent(post.id),{method:"DELETE",credentials:"same-origin",headers:{"x-csrf-token":csrf}});
      const result=await response.json().catch(()=>({})) as {ok?:boolean};if(!response.ok||result.ok!==true)throw new Error("delete_failed");
      setPosts(current=>current.filter(item=>item.id!==post.id));setToast({kind:"success",text:"Post excluído."});
    }catch{setToast({kind:"error",text:"Não foi possível excluir o post."});}finally{setPostDeleting(null);}
  }

  function openFaqEditor(faq:"create"|FaqView){
    setFaqEditor(faq);
    if(faq==="create"){setFaqForm({question:"",answer:"",category:"Geral",active:true,order:String(faqItems.length)});return;}
    setFaqForm({question:faq.question,answer:faq.answer,category:faq.category,active:faq.active,order:String(faq.order)});
  }

  async function saveFaq(){
    if(faqSaving||!faqEditor)return;
    const order=Number(faqForm.order);
    if(!faqForm.question.trim()||!faqForm.answer.trim()||!faqForm.category.trim()||!Number.isInteger(order)||order<0){setToast({kind:"error",text:"Preencha pergunta, resposta, categoria e ordem."});return;}
    if(/[<>]/.test(faqForm.question+faqForm.answer+faqForm.category)){setToast({kind:"error",text:"HTML não é permitido no FAQ."});return;}
    setFaqSaving(true);
    try{
      const csrf=await adminCsrf();const payload={question:faqForm.question.trim(),answer:faqForm.answer.trim(),category:faqForm.category.trim(),active:faqForm.active,order};
      const isCreate=faqEditor==="create";const endpoint=isCreate?"/Api/Admin/FAQ":"/Api/Admin/FAQ/"+encodeURIComponent(faqEditor.id);
      const response=await fetch(endpoint,{method:isCreate?"POST":"PUT",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":csrf},body:JSON.stringify(payload)});
      const result=await response.json().catch(()=>({})) as {ok?:boolean;faq?:FaqView};
      if(!response.ok||!result.faq)throw new Error("save_failed");
      setFaqItems(current=>isCreate?[...current,result.faq!]:current.map(item=>item.id===result.faq!.id?result.faq!:item));setFaqEditor(null);setToast({kind:"success",text:isCreate?"FAQ criado.":"FAQ atualizado."});
    }catch{setToast({kind:"error",text:"Não foi possível salvar o FAQ."});}finally{setFaqSaving(false);}
  }

  async function removeFaq(faq:FaqView){
    if(faqDeleting)return;
    if(!window.confirm("Excluir esta pergunta do FAQ?"))return;
    setFaqDeleting(faq.id);
    try{
      const csrf=await adminCsrf();const response=await fetch("/Api/Admin/FAQ/"+encodeURIComponent(faq.id),{method:"DELETE",credentials:"same-origin",headers:{"x-csrf-token":csrf}});
      const result=await response.json().catch(()=>({})) as {ok?:boolean};if(!response.ok||result.ok!==true)throw new Error("delete_failed");
      setFaqItems(current=>current.filter(item=>item.id!==faq.id));setToast({kind:"success",text:"Pergunta excluída."});
    }catch{setToast({kind:"error",text:"Não foi possível excluir a pergunta."});}finally{setFaqDeleting(null);}
  }

  async function saveTicket(ticket:TicketView){
    if(ticketSaving)return;
    setTicketSaving(ticket.id);
    try{
      const csrf=await adminCsrf();const response=await fetch("/Api/Admin/Support/"+encodeURIComponent(ticket.id),{method:"PUT",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":csrf},body:JSON.stringify({status:ticket.status,adminReply:ticketReply[ticket.id]??ticket.adminReply??""})});
      const result=await response.json().catch(()=>({})) as {ok?:boolean;ticket?:TicketView};if(!response.ok||!result.ticket)throw new Error("save_failed");
      setTickets(current=>current.map(item=>item.id===ticket.id?result.ticket!:item));setTicketReply(current=>({...current,[ticket.id]:""}));setToast({kind:"success",text:"Ticket atualizado."});
    }catch{setToast({kind:"error",text:"Não foi possível atualizar o ticket."});}finally{setTicketSaving(null);}
  }

  function exportCustomers(){
    if(!data.customers.length)return;
    downloadCsv("shiny-clientes.csv",[
      ["ID","Usuário","Email","Criado em"],
      ...data.customers.map(item=>[item.id,item.username,item.email,item.createdAt])
    ]);
    setToast({kind:"success",text:"CSV de clientes exportado."});
  }

  async function exportLogs(){
    try{
      const params=new URLSearchParams();if(logQuery.trim())params.set("action",logQuery.trim());if(logResource.trim())params.set("resource",logResource.trim());if(logResult)params.set("result",logResult);if(logFrom)params.set("from",logFrom);if(logTo)params.set("to",logTo);
      const response=await fetch("/Api/Admin/Logs/Export?"+params.toString(),{credentials:"same-origin",cache:"no-store"});
      if(!response.ok)throw new Error("export_failed");
      const blob=await response.blob();const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download="shiny-audit-log.csv";document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
      setToast({kind:"success",text:"Exportação de logs concluída."});
    }catch{setToast({kind:"error",text:"Não foi possível exportar os logs."});}
  }

  const current=sections.find(item=>item.id===active)!;

  function renderSection(){
    if(active==="overview"){
      const quick=["orders","products","coupons","settings"] as SectionId[];
      const m=orderMetrics;
      return <section className="vault2-page">
        <SectionIntro number="01" title="Overview" description="Visão operacional derivada exclusivamente dos pedidos, eventos pendentes e catálogo persistidos no servidor."/>
        <div className="vault2-metric-grid">
          {[
            ["Receita paga",money(m.revenue),m.paid+" pedidos PAID"],
            ["Total de pedidos",""+m.total,m.pending+" pendentes"],
            ["PENDING",""+m.pending,m.ordersWithStockReservation+" com reserva de estoque"],
            ["Falhos / cancelados",""+(m.failed+m.cancelled),m.failed+" falhos · "+m.cancelled+" cancelados"],
            ["Transações sem associação",""+m.unassociatedTransactions,"Eventos Promisse aguardando pedido"],
            ["Fila de reconciliação",""+data.reconciliation.queue.length,"Pagamentos elegíveis no banco"],
            ["Alertas abertos",""+data.reconciliation.alerts.length,"Alertas operacionais sem reconhecimento"]
          ].map(([label,value,note])=><article className="vault2-metric-card" key={label}>
            <p>{label}</p><strong>{value}</strong><span>{note}</span>
          </article>)}
        </div>
        <div className="vault2-grid-2">
          <article className="vault2-panel">
            <div className="vault2-panel-head"><div><p className="vault2-kicker">PAGAMENTOS</p><h2>Estados persistidos</h2></div><StatusTag ok={m.paid>0} label={m.paid+" pagos"}/></div>
            <div className="vault2-detail-list">
              <div><span>PENDING</span><strong>{m.pending}</strong></div>
              <div><span>PAID</span><strong>{m.paid}</strong></div>
              <div><span>FAILED</span><strong>{m.failed}</strong></div>
              <div><span>CANCELLED</span><strong>{m.cancelled}</strong></div>
              <div><span>EXPIRED</span><strong>{m.expired}</strong></div>
            </div>
          </article>
          <article className="vault2-panel">
            <div className="vault2-panel-head"><div><p className="vault2-kicker">RESERVAS</p><h2>Estoque e cupom</h2></div></div>
            <div className="vault2-detail-list">
              <div><span>Pedidos com estoque reservado</span><strong>{m.ordersWithStockReservation}</strong></div>
              <div><span>Unidades reservadas</span><strong>{m.pendingStockUnits}</strong></div>
              <div><span>Pedidos com cupom reservado</span><strong>{m.ordersWithCouponReservation}</strong></div>
              <div><span>Reconciliação necessária / erro</span><strong>{m.reconciliationErrors}</strong></div>
            </div>
          </article>
        </div>
        <div className="vault2-panel">
          <div className="vault2-panel-head"><div><p className="vault2-kicker">INTEGRIDADE</p><h2>Webhooks e reconciliação</h2></div><button className="vault2-secondary-button" type="button" onClick={reconcileAdminOrders} disabled={reconcilingOrders}>{reconcilingOrders?"Reconciliando…":"Reconciliar pendentes"}</button></div>
          <div className="vault2-detail-list">
            <div><span>Último webhook válido</span><strong>{m.lastValidWebhook?dateTime(m.lastValidWebhook.at):"Nenhum registrado"}</strong></div>
            <div><span>Último webhook rejeitado</span><strong>{m.lastRejectedWebhook?dateTime(m.lastRejectedWebhook.at):"Nenhum registrado"}</strong></div>
            <div><span>Última reconciliação</span><strong>{m.lastReconciliationAt?dateTime(m.lastReconciliationAt):"Nenhuma registrada"}</strong></div>
          </div>
        </div>
        <div className="vault2-panel">
          <div className="vault2-panel-head"><div><p className="vault2-kicker">ATIVIDADE RECENTE</p><h2>Pedidos</h2></div><button className="vault2-secondary-button" type="button" onClick={loadAdminOrders} disabled={ordersLoading}>{ordersLoading?"Atualizando…":"Atualizar"}</button></div>
          {orders.length?<div className="vault2-delivery-list">{orders.slice(0,5).map(order=><div key={order.id}><span>{dateTime(order.createdAt)}</span><strong>{order.status} · {money(order.total)}</strong><em>{order.stockReservationQuantity>0?order.stockReservationQuantity+" estoque":order.couponReserved?"cupom reservado":"sem reserva"}</em><small>{order.transactionIdMasked||"sem transação"}{order.needsReconciliation?" · reconciliação necessária":""}</small></div>)}</div>:<EmptyState title="Nenhum pedido" text="O armazenamento de pedidos está vazio."/>}
        </div>
        <div className="vault2-panel">
          <div className="vault2-panel-head"><div><p className="vault2-kicker">ATALHOS</p><h2>Operação rápida</h2></div></div>
          <div className="vault2-shortcuts">{quick.map(id=><button key={id} type="button" onClick={()=>goTo(id)}><span>{sections.find(item=>item.id===id)?.short}</span><strong>{sections.find(item=>item.id===id)?.label}</strong><i>↗</i></button>)}</div>
        </div>
      </section>;
    }

    if(active==="orders"){
      return <section className="vault2-page">
        <SectionIntro number="02" title="Pedidos" description="Pedidos persistidos no PostgreSQL, com estado comercial, pagamento, reservas e sinalização de reconciliação."/>
        <div className="vault2-metric-grid">
          {[
            ["PENDING",""+orderMetrics.pending,"aguardando confirmação"],
            ["PAID",""+orderMetrics.paid,money(orderMetrics.revenue)],
            ["FAILED",""+orderMetrics.failed,"sem pagamento confirmado"],
            ["CANCELLED / EXPIRED",""+(orderMetrics.cancelled+orderMetrics.expired),"estados terminais locais"],
            ["Reconciliação necessária",""+orders.filter(item=>item.needsReconciliation).length,orderMetrics.reconciliationErrors+" com erro registrado"]
          ].map(([label,value,note])=><article className="vault2-metric-card" key={label}><p>{label}</p><strong>{value}</strong><span>{note}</span></article>)}
        </div>
        <div className="vault2-panel">
          <div className="vault2-panel-head">
            <div><p className="vault2-kicker">OPERAÇÃO</p><h2>Pedidos persistidos</h2></div>
            <div className="vault2-row-actions"><button type="button" onClick={loadAdminOrders} disabled={ordersLoading}>{ordersLoading?"Atualizando…":"Atualizar"}</button><button type="button" className="vault2-primary-button" onClick={reconcileAdminOrders} disabled={reconcilingOrders}>{reconcilingOrders?"Reconciliando…":"Reconciliar PENDING"}</button></div>
          </div>
          <div className="vault2-table-wrap"><table><thead><tr><th>Pedido</th><th>Estado</th><th>Pagamento</th><th>Total</th><th>Reservas</th><th>Reconciliação</th><th>Datas</th></tr></thead><tbody>
            {orders.length?orders.map(order=><tr key={order.id}>
              <td><strong>{order.id.slice(0,8)}…</strong><small>{order.items.map(item=>item.name+" × "+item.quantity).join(", ")}</small></td>
              <td><StatusTag ok={order.status==="PAID"} label={order.status}/></td>
              <td><strong>{order.paymentStatus||"—"}</strong><small>{order.transactionIdMasked||"sem transactionId"}</small></td>
              <td><strong>{money(order.total)}</strong></td>
              <td><strong>{order.stockReservationQuantity>0?order.stockReservationQuantity+" unid.": "—"}</strong><small>{order.couponReserved?"Cupom reservado":"Sem cupom reservado"}</small></td>
              <td>{order.needsReconciliation?<StatusTag ok={false} label={order.lastReconciliationError?"Erro":"Necessária"}/>:<StatusTag ok={true} label="Sem pendência"/>}</td>
              <td><small>{dateTime(order.createdAt)}</small><small>Atualizado {dateTime(order.updatedAt)}</small>{order.expiresAt&&<small>Prazo {dateTime(order.expiresAt)}</small>}</td>
            </tr>):<tr><td colSpan={7}><EmptyState title="Nenhum pedido" text={ordersLoading?"Carregando pedidos…":"Não há pedidos persistidos."}/></td></tr>}
          </tbody></table></div>
          <p className="vault2-sensitive-note">O dashboard não expõe userId, dados do pagador, QR Code, API key, webhook secret, cookies ou payloads de pagamento.</p>
        </div>
      </section>;
    }

    if(active==="products"){
      return <section className="vault2-page">
        <SectionIntro number="03" title="Produtos" description="Catálogo persistente com criação, edição, estoque, preço, ativação e exclusão protegidos no servidor."/>
        <div className="vault2-panel">
          <div className="vault2-panel-head">
            <div><p className="vault2-kicker">CATÁLOGO</p><h2>Produtos</h2></div>
            <button className="vault2-primary-button" type="button" onClick={()=>openProductEditor("create")}>Novo produto</button>
          </div>
          <div className="vault2-table-wrap"><table><thead><tr><th>Imagem</th><th>Produto</th><th>Preço</th><th>Estoque</th><th>Status</th><th>Categoria / Tags</th><th>Ações</th></tr></thead><tbody>
            {products.length?products.map(item=><tr key={item.id}>
              <td><div className="vault2-product-thumb">{item.image?<img src={item.image} alt="" />:"—"}</div></td>
              <td><strong>{item.name}</strong><small>{item.id}</small></td>
              <td>{money(item.price)}</td>
              <td>{typeof item.stock==="number"?item.stock:"—"}</td>
              <td><StatusTag ok={item.active!==false} label={item.active===false?"Inativo":"Ativo"}/></td>
              <td><strong>{item.category||"Sem categoria"}</strong><small>{item.tags?.length?item.tags.join(", "):"Sem tags"}</small></td>
              <td><div className="vault2-row-actions"><button type="button" onClick={()=>openProductEditor(item)}>Editar</button><button type="button" className="danger" disabled={productDeleting===item.id} onClick={()=>removeProduct(item)}>{productDeleting===item.id?"Excluindo…":"Excluir"}</button></div></td>
            </tr>):<tr><td colSpan={7}><EmptyState title="Nenhum produto" text="O catálogo está vazio. Crie o primeiro produto para começar a operar."/></td></tr>}
          </tbody></table></div>
        </div>
        {productEditor&&<div className="vault2-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target&&!productSaving)setProductEditor(null)}}>
          <section className="vault2-modal" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
            <div className="vault2-modal-head"><div><p className="vault2-kicker">{productEditor==="create"?"NOVO PRODUTO":"EDITAR PRODUTO"}</p><h2 id="product-editor-title">{productEditor==="create"?"Cadastrar produto":"Editar produto"}</h2></div><button type="button" onClick={()=>setProductEditor(null)} disabled={productSaving} aria-label="Fechar">×</button></div>
            <div className="vault2-form-grid">
              <label>Nome<input value={productForm.name} onChange={event=>setProductForm({...productForm,name:event.target.value})} maxLength={160}/></label>
              <label>Preço<input type="number" min="0" step="0.01" value={productForm.price} onChange={event=>setProductForm({...productForm,price:event.target.value})}/></label>
              <label>Estoque<input type="number" min="0" step="1" value={productForm.stock} onChange={event=>setProductForm({...productForm,stock:event.target.value})}/></label>
              <label>Categoria<input value={productForm.category} onChange={event=>setProductForm({...productForm,category:event.target.value})} maxLength={80}/></label>
              <label className="vault2-form-wide">Tags<input placeholder="tag1, tag2" value={productForm.tags} onChange={event=>setProductForm({...productForm,tags:event.target.value})}/></label>
              <label className="vault2-form-wide">Imagem / URL segura<input placeholder="/assets/produto.webp ou https://…" value={productForm.image} onChange={event=>setProductForm({...productForm,image:event.target.value})} maxLength={500}/></label>
              <label className="vault2-form-wide">Descrição<textarea value={productForm.description} onChange={event=>setProductForm({...productForm,description:event.target.value})} maxLength={5000} rows={5}/></label>
              <label className="vault2-toggle vault2-form-wide"><input type="checkbox" checked={productForm.active} onChange={event=>setProductForm({...productForm,active:event.target.checked})}/><span>Produto ativo no catálogo</span></label>
            </div>
            <div className="vault2-modal-actions"><button type="button" className="vault2-secondary-button" onClick={()=>setProductEditor(null)} disabled={productSaving}>Cancelar</button><button type="button" className="vault2-primary-button" onClick={saveProduct} disabled={productSaving}>{productSaving?"Salvando…":productEditor==="create"?"Criar produto":"Salvar alterações"}</button></div>
          </section>
        </div>}
      </section>;
    }

    if(active==="customers"){
      return <section className="vault2-page">
        <SectionIntro number="04" title="Clientes" description="Dados autorizados server-side a partir do armazenamento de usuários, sem incluir hashes de senha."/>
        <div className="vault2-panel">
          <div className="vault2-panel-head"><div><p className="vault2-kicker">USUÁRIOS REAIS</p><h2>Clientes</h2></div>
            <div className="vault2-panel-tools">
              <input aria-label="Buscar clientes" placeholder="Buscar usuário ou email" value={customerQuery} onChange={event=>setCustomerQuery(event.target.value)}/>
              {data.customers.length>0&&<button className="vault2-utility-button" type="button" onClick={exportCustomers}>Exportar CSV</button>}
            </div>
          </div>
          <div className="vault2-table-wrap"><table><thead><tr><th>Cliente</th><th>Email</th><th>Cadastro</th><th>Gasto total</th><th>Pedidos</th><th>Última compra</th></tr></thead><tbody>
            {filteredCustomers.length?filteredCustomers.map(item=><tr key={item.id}><td><strong>{item.username}</strong><small>{item.id}</small></td><td>{item.email}</td><td>{dateTime(item.createdAt)}</td><td>Nenhum dado disponível</td><td>Nenhum dado disponível</td><td>Nenhum dado disponível</td></tr>)
              :<tr><td colSpan={6}><EmptyState text={data.customers.length?"Nenhum cliente corresponde à busca.":"Storage/users.json está vazio: nenhum cliente cadastrado."}/></td></tr>}
          </tbody></table></div>
        </div>
        <div className="vault2-note">Perfil, histórico, gasto e compras permanecem sem métricas porque não existe persistência de pedidos associada aos usuários.</div>
      </section>;
    }

    if(active==="posts"){
      return <section className="vault2-page">
        <SectionIntro number="07" title="Posts / News" description="Conteúdo persistente com rascunho, publicação, agendamento, preview e SEO básico. A área pública só lê posts publicados."/>
        <div className="vault2-panel">
          <div className="vault2-panel-head"><div><p className="vault2-kicker">EDITORIAL</p><h2>Publicações</h2></div><button className="vault2-primary-button" type="button" onClick={()=>openPostEditor("create")}>Novo post</button></div>
          <div className="vault2-table-wrap"><table><thead><tr><th>Título</th><th>Categoria</th><th>Status</th><th>Publicação</th><th>Ações</th></tr></thead><tbody>
            {posts.length?posts.map(post=><tr key={post.id}><td><strong>{post.title}</strong><small>/News/{post.slug}</small></td><td>{post.category}</td><td><StatusTag ok={post.status==="published"} label={post.status==="published"?"Publicado":post.status==="scheduled"?"Agendado":"Rascunho"}/></td><td>{post.publishedAt?dateTime(post.publishedAt):post.scheduledAt?dateTime(post.scheduledAt):"—"}</td><td><div className="vault2-row-actions"><button type="button" onClick={()=>openPostEditor(post)}>Editar</button><button type="button" className="danger" disabled={postDeleting===post.id} onClick={()=>removePost(post)}>{postDeleting===post.id?"Excluindo…":"Excluir"}</button></div></td></tr>):<tr><td colSpan={5}>{postsLoaded?<EmptyState title="Nenhum post" text="Crie um rascunho ou publique a primeira notícia."/>:<span className="vault2-muted">Carregando posts…</span>}</td></tr>}
          </tbody></table></div>
        </div>
        {postEditor&&<div className="vault2-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target&&!postSaving)setPostEditor(null)}}>
          <section className="vault2-modal vault2-post-modal" role="dialog" aria-modal="true" aria-labelledby="post-editor-title">
            <div className="vault2-modal-head"><div><p className="vault2-kicker">{postEditor==="create"?"NOVO POST":"EDITAR POST"}</p><h2 id="post-editor-title">{postPreview?"Preview":postEditor==="create"?"Criar publicação":"Editar publicação"}</h2></div><button type="button" onClick={()=>setPostEditor(null)} disabled={postSaving} aria-label="Fechar">×</button></div>
            {postPreview?<article className="vault2-post-preview">{postForm.image&&<img src={postForm.image} alt="" />}<p className="vault2-kicker">{postForm.category}</p><h3>{postForm.title||"Sem título"}</h3><p className="vault2-post-summary">{postForm.summary}</p><div>{postForm.content.split(/\n\s*\n/).filter(Boolean).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div></article>:<div className="vault2-form-grid">
              <label>Título<input value={postForm.title} onChange={event=>setPostForm({...postForm,title:event.target.value})} maxLength={180}/></label>
              <label>Slug<input placeholder="gerado pelo título" value={postForm.slug} onChange={event=>setPostForm({...postForm,slug:event.target.value})} maxLength={100}/></label>
              <label>Categoria<input value={postForm.category} onChange={event=>setPostForm({...postForm,category:event.target.value})} maxLength={80}/></label>
              <label>Status<select value={postForm.status} onChange={event=>setPostForm({...postForm,status:event.target.value as PostForm["status"]})}><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="scheduled">Agendado</option></select></label>
              <label className="vault2-form-wide">Resumo<textarea rows={3} maxLength={500} value={postForm.summary} onChange={event=>setPostForm({...postForm,summary:event.target.value})}/></label>
              <label className="vault2-form-wide">Conteúdo<textarea rows={10} maxLength={30000} value={postForm.content} onChange={event=>setPostForm({...postForm,content:event.target.value})}/></label>
              <label>Imagem / URL segura<input value={postForm.image} onChange={event=>setPostForm({...postForm,image:event.target.value})} placeholder="/assets/news.webp ou https://…"/></label>
              <label>Agendamento<input type="datetime-local" disabled={postForm.status!=="scheduled"} value={postForm.scheduledAt} onChange={event=>setPostForm({...postForm,scheduledAt:event.target.value})}/></label>
              <label>SEO title<input value={postForm.seoTitle} onChange={event=>setPostForm({...postForm,seoTitle:event.target.value})} maxLength={180}/></label>
              <label>SEO description<input value={postForm.seoDescription} onChange={event=>setPostForm({...postForm,seoDescription:event.target.value})} maxLength={300}/></label>
              <p className="vault2-form-wide vault2-sensitive-note">Conteúdo em texto simples. HTML e scripts são rejeitados pelo backend para evitar XSS.</p>
            </div>}
            <div className="vault2-modal-actions">{!postPreview&&<button type="button" className="vault2-secondary-button" onClick={()=>setPostPreview(true)}>Preview</button>}{postPreview&&<button type="button" className="vault2-secondary-button" onClick={()=>setPostPreview(false)}>Editar</button>}<button type="button" className="vault2-secondary-button" onClick={()=>setPostEditor(null)} disabled={postSaving}>Cancelar</button>{!postPreview&&<button type="button" className="vault2-primary-button" onClick={savePost} disabled={postSaving}>{postSaving?"Salvando…":postForm.status==="published"?"Publicar agora":postForm.status==="scheduled"?"Agendar publicação":postEditor==="create"?"Salvar rascunho":"Salvar alterações"}</button>}</div>
          </section>
        </div>}
      </section>;
    }

    if(active==="support"){
      return <section className="vault2-page">
        <SectionIntro number="08" title="Suporte" description="Tickets reais ligados às contas de usuário. O OWNER pode assumir, responder e resolver cada solicitação."/>
        <div className="vault2-panel"><div className="vault2-panel-head"><div><p className="vault2-kicker">ATENDIMENTO</p><h2>Tickets</h2></div><span className="vault2-count">{tickets.length} carregados</span></div>
          <div className="vault2-ticket-list">{tickets.length?tickets.map(ticket=><article className="vault2-ticket" key={ticket.id}>
            <div className="vault2-ticket-head"><div><strong>{ticket.subject}</strong><small>{ticket.userId} · {dateTime(ticket.createdAt)}</small></div><select value={ticket.status} onChange={event=>setTickets(current=>current.map(item=>item.id===ticket.id?{...item,status:event.target.value as TicketView["status"]}:item))}><option value="open">Aberto</option><option value="in_progress">Em atendimento</option><option value="resolved">Resolvido</option></select></div>
            <p>{ticket.message}</p>{ticket.adminReply&&<blockquote>{ticket.adminReply}</blockquote>}
            <textarea rows={3} placeholder="Resposta do suporte" value={ticketReply[ticket.id]??""} onChange={event=>setTicketReply(current=>({...current,[ticket.id]:event.target.value}))} maxLength={5000}/>
            <div className="vault2-ticket-actions"><button className="vault2-primary-button" type="button" disabled={ticketSaving===ticket.id} onClick={()=>saveTicket(ticket)}>{ticketSaving===ticket.id?"Salvando…":"Salvar atendimento"}</button></div>
          </article>):ticketsLoaded?<EmptyState title="Nenhum ticket" text="Ainda não existem solicitações de suporte."/>:<span className="vault2-muted">Carregando tickets…</span>}</div>
        </div>
      </section>;
    }

    if(active==="faq"){
      return <section className="vault2-page">
        <SectionIntro number="09" title="FAQ" description="Perguntas persistentes, ordenadas e publicadas apenas quando ativas. O site público consome o mesmo backend."/>
        <div className="vault2-panel">
          <div className="vault2-panel-head"><div><p className="vault2-kicker">CONTEÚDO</p><h2>Perguntas frequentes</h2></div><button className="vault2-primary-button" type="button" onClick={()=>openFaqEditor("create")}>Nova pergunta</button></div>
          <div className="vault2-table-wrap"><table><thead><tr><th>Ordem</th><th>Pergunta</th><th>Categoria</th><th>Status</th><th>Ações</th></tr></thead><tbody>
            {faqItems.length?[...faqItems].sort((a,b)=>a.order-b.order).map(faq=><tr key={faq.id}><td>{faq.order}</td><td><strong>{faq.question}</strong><small>{faq.answer}</small></td><td>{faq.category}</td><td><StatusTag ok={faq.active} label={faq.active?"Ativo":"Oculto"}/></td><td><div className="vault2-row-actions"><button type="button" onClick={()=>openFaqEditor(faq)}>Editar</button><button type="button" className="danger" disabled={faqDeleting===faq.id} onClick={()=>removeFaq(faq)}>{faqDeleting===faq.id?"Excluindo…":"Excluir"}</button></div></td></tr>):<tr><td colSpan={5}>{faqLoaded?<EmptyState title="Nenhuma pergunta" text="Crie a primeira pergunta para a área pública."/>:<span className="vault2-muted">Carregando FAQ…</span>}</td></tr>}
          </tbody></table></div>
        </div>
        {faqEditor&&<div className="vault2-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target&&!faqSaving)setFaqEditor(null)}}>
          <section className="vault2-modal" role="dialog" aria-modal="true" aria-labelledby="faq-editor-title">
            <div className="vault2-modal-head"><div><p className="vault2-kicker">{faqEditor==="create"?"NOVA PERGUNTA":"EDITAR PERGUNTA"}</p><h2 id="faq-editor-title">{faqEditor==="create"?"Criar pergunta":"Editar pergunta"}</h2></div><button type="button" onClick={()=>setFaqEditor(null)} disabled={faqSaving} aria-label="Fechar">×</button></div>
            <div className="vault2-form-grid">
              <label className="vault2-form-wide">Pergunta<input value={faqForm.question} onChange={event=>setFaqForm({...faqForm,question:event.target.value})} maxLength={500}/></label>
              <label className="vault2-form-wide">Resposta<textarea rows={7} value={faqForm.answer} onChange={event=>setFaqForm({...faqForm,answer:event.target.value})} maxLength={5000}/></label>
              <label>Categoria<input value={faqForm.category} onChange={event=>setFaqForm({...faqForm,category:event.target.value})} maxLength={80}/></label>
              <label>Ordem<input type="number" min="0" step="1" value={faqForm.order} onChange={event=>setFaqForm({...faqForm,order:event.target.value})}/></label>
              <label className="vault2-toggle vault2-form-wide"><input type="checkbox" checked={faqForm.active} onChange={event=>setFaqForm({...faqForm,active:event.target.checked})}/><span>Publicar pergunta</span></label>
            </div>
            <div className="vault2-modal-actions"><button type="button" className="vault2-secondary-button" onClick={()=>setFaqEditor(null)} disabled={faqSaving}>Cancelar</button><button type="button" className="vault2-primary-button" onClick={saveFaq} disabled={faqSaving}>{faqSaving?"Salvando…":faqEditor==="create"?"Criar pergunta":"Salvar alterações"}</button></div>
          </section>
        </div>}
      </section>;
    }

    if(active==="analytics"){
      return <section className="vault2-page">
        <SectionIntro number="10" title="Analytics" description="Métricas derivadas de eventos reais do site nos últimos 30 dias. Conversão financeira só aparece com confirmação de pagamento."/>
        {analytics?<><div className="vault2-metric-grid">{[["Visualizações",String(analytics.byEvent.page_view||0),"page_view"],["Produtos vistos",String(analytics.byEvent.product_view||0),"product_view"],["Inícios de checkout",String(analytics.byEvent.checkout_start||0),"checkout_start"],["Conversão","Dados indisponíveis","Sem evento de pagamento confirmado"]].map(item=><article className="vault2-metric-card" key={item[2]}><span>{item[0]}</span><strong>{item[1]}</strong><small>{item[2]}</small></article>)}</div><div className="vault2-panel"><div className="vault2-panel-head"><div><p className="vault2-kicker">PÁGINAS</p><h2>Mais acessadas</h2></div><span className="vault2-count">30 dias</span></div><div className="vault2-table-wrap"><table><thead><tr><th>Página</th><th>Visualizações</th></tr></thead><tbody>{analytics.topPages.length?analytics.topPages.map(item=><tr key={item.path}><td>{item.path}</td><td>{item.count}</td></tr>):<tr><td colSpan={2}><EmptyState title="Sem eventos" text="Ainda não existem visualizações persistidas."/></td></tr>}</tbody></table></div></div></>:<div className="vault2-panel"><EmptyState title="Dados indisponíveis" text="Não foi possível carregar os eventos de analytics." /></div>}
      </section>;
    }

    if(active==="logs"){
      return <section className="vault2-page">
        <SectionIntro number="11" title="Logs" description="Leitura somente server-side dos eventos administrativos reais registrados no audit log."/>
        <div className="vault2-panel">
          <div className="vault2-panel-head"><div><p className="vault2-kicker">AUDIT LOG</p><h2>Atividade administrativa</h2></div>
            <div className="vault2-log-filters">
              <input aria-label="Filtrar ação ou usuário" placeholder="Ação ou usuário" value={logQuery} onChange={event=>setLogQuery(event.target.value)}/>
              <input aria-label="Filtrar recurso" placeholder="Recurso" value={logResource} onChange={event=>setLogResource(event.target.value)}/>
              <select aria-label="Filtrar resultado" value={logResult} onChange={event=>setLogResult(event.target.value)}><option value="">Todos os resultados</option><option value="success">Sucesso</option><option value="failure">Falha</option><option value="rate_limited">Rate limit</option><option value="invalid_csrf">CSRF inválido</option></select>
              <input aria-label="Data inicial" type="date" value={logFrom} onChange={event=>setLogFrom(event.target.value)}/>
              <input aria-label="Data final" type="date" value={logTo} onChange={event=>setLogTo(event.target.value)}/>
              <button className="vault2-utility-button" type="button" onClick={exportLogs}>Exportar CSV</button>
            </div>
          </div>
          <div className="vault2-table-wrap"><table><thead><tr><th>Data</th><th>Ação</th><th>Usuário</th><th>Recurso</th><th>Resultado</th><th>Motivo</th><th>IP</th></tr></thead><tbody>
            {filteredLogs.length?filteredLogs.map((item,index)=><tr key={item.at+item.event+index}><td>{dateTime(item.at)}</td><td><strong>{item.event.replaceAll("_"," ")}</strong></td><td>{item.actor}</td><td>{item.resource||"—"}</td><td>{item.result}</td><td>{item.reason||"—"}</td><td>{item.ip}</td></tr>)
              :<tr><td colSpan={7}><EmptyState text={data.logs.length?"Nenhum log corresponde ao filtro.":"Nenhum evento legível foi encontrado em Logs/audit.log."}/></td></tr>}
          </tbody></table></div>
        </div>
        <div className="vault2-note">Retenção configurável: Ainda não configurado. A dashboard não altera nem apaga o arquivo de auditoria.</div>
      </section>;
    }

    if(active==="coupons"){
      return <section className="vault2-page">
        <SectionIntro number="06" title="Cupons" description="Regras de desconto persistentes, validadas no servidor e prontas para uso no checkout autenticado."/>
        <div className="vault2-panel">
          <div className="vault2-panel-head"><div><p className="vault2-kicker">DESCONTOS</p><h2>Cupons</h2></div><button className="vault2-primary-button" type="button" onClick={()=>openCouponEditor("create")}>Novo cupom</button></div>
          <div className="vault2-table-wrap"><table><thead><tr><th>Código</th><th>Desconto</th><th>Validade</th><th>Uso</th><th>Aplicação</th><th>Status</th><th>Ações</th></tr></thead><tbody>
            {coupons.length?coupons.map(coupon=><tr key={coupon.id}>
              <td><strong>{coupon.code}</strong><small>{coupon.minimumAmount>0?"Mínimo "+money(coupon.minimumAmount):"Sem mínimo"}</small></td>
              <td>{coupon.type==="percent"?coupon.value+"%":money(coupon.value)}</td>
              <td><small>{coupon.startsAt?dateTime(coupon.startsAt):"Imediato"} → {coupon.expiresAt?dateTime(coupon.expiresAt):"Sem expiração"}</small></td>
              <td>{coupon.usedCount}{coupon.usageLimit!==undefined?"/"+coupon.usageLimit:""}</td>
              <td><strong>{coupon.productIds.length?"Produtos selecionados":coupon.category?"Categoria "+coupon.category:coupon.customerId?"Cliente específico":"Todos"}</strong></td>
              <td><StatusTag ok={couponStatus(coupon)==="Ativo"} label={couponStatus(coupon)}/></td>
              <td><div className="vault2-row-actions"><button type="button" onClick={()=>openCouponEditor(coupon)}>Editar</button><button type="button" className="danger" disabled={couponDeleting===coupon.id} onClick={()=>removeCoupon(coupon)}>{couponDeleting===coupon.id?"Excluindo…":"Excluir"}</button></div></td>
            </tr>):<tr><td colSpan={7}>{couponsLoaded?<EmptyState title="Nenhum cupom" text="Crie uma regra de desconto para disponibilizá-la no checkout."/>:<span className="vault2-muted">Carregando cupons…</span>}</td></tr>}
          </tbody></table></div>
        </div>
        <div className="vault2-note"><strong>Validação no checkout:</strong> preço, validade, limite, mínimo, produto, categoria e cliente são recalculados no servidor. O navegador não define o desconto final.</div>
        {couponEditor&&<div className="vault2-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target&&!couponSaving)setCouponEditor(null)}}>
          <section className="vault2-modal" role="dialog" aria-modal="true" aria-labelledby="coupon-editor-title">
            <div className="vault2-modal-head"><div><p className="vault2-kicker">{couponEditor==="create"?"NOVO CUPOM":"EDITAR CUPOM"}</p><h2 id="coupon-editor-title">{couponEditor==="create"?"Criar cupom":"Editar cupom"}</h2></div><button type="button" onClick={()=>setCouponEditor(null)} disabled={couponSaving} aria-label="Fechar">×</button></div>
            <div className="vault2-form-grid">
              <label>Código<input value={couponForm.code} onChange={event=>setCouponForm({...couponForm,code:event.target.value.toUpperCase()})} maxLength={40}/></label>
              <label>Tipo<select value={couponForm.type} onChange={event=>setCouponForm({...couponForm,type:event.target.value as "percent"|"fixed"})}><option value="percent">Percentual</option><option value="fixed">Valor fixo</option></select></label>
              <label>Desconto<input type="number" min="0.01" step="0.01" value={couponForm.value} onChange={event=>setCouponForm({...couponForm,value:event.target.value})}/></label>
              <label>Valor mínimo<input type="number" min="0" step="0.01" value={couponForm.minimumAmount} onChange={event=>setCouponForm({...couponForm,minimumAmount:event.target.value})}/></label>
              <label>Início<input type="datetime-local" value={couponForm.startsAt} onChange={event=>setCouponForm({...couponForm,startsAt:event.target.value})}/></label>
              <label>Expiração<input type="datetime-local" value={couponForm.expiresAt} onChange={event=>setCouponForm({...couponForm,expiresAt:event.target.value})}/></label>
              <label>Limite de uso<input type="number" min="1" step="1" placeholder="Sem limite" value={couponForm.usageLimit} onChange={event=>setCouponForm({...couponForm,usageLimit:event.target.value})}/></label>
              <label>Categoria<input value={couponForm.category} onChange={event=>setCouponForm({...couponForm,category:event.target.value})}/></label>
              <label className="vault2-form-wide">IDs de produtos<input placeholder="shiny-core, shiny-pro" value={couponForm.productIds} onChange={event=>setCouponForm({...couponForm,productIds:event.target.value})}/></label>
              <label className="vault2-form-wide">ID do cliente específico<input value={couponForm.customerId} onChange={event=>setCouponForm({...couponForm,customerId:event.target.value})}/></label>
              <label className="vault2-toggle vault2-form-wide"><input type="checkbox" checked={couponForm.active} onChange={event=>setCouponForm({...couponForm,active:event.target.checked})}/><span>Cupom ativo</span></label>
            </div>
            <div className="vault2-modal-actions"><button type="button" className="vault2-secondary-button" onClick={()=>setCouponEditor(null)} disabled={couponSaving}>Cancelar</button><button type="button" className="vault2-primary-button" onClick={saveCoupon} disabled={couponSaving}>{couponSaving?"Salvando…":couponEditor==="create"?"Criar cupom":"Salvar alterações"}</button></div>
          </section>
        </div>}
      </section>;
    }

    if(active==="webhooks"){
      return <section className="vault2-page">
        <SectionIntro number="12" title="Webhooks" description="Destinos reais com assinatura HMAC, proteção SSRF, timeout, limite de resposta e histórico de entrega."/>
        <div className="vault2-panel">
          <div className="vault2-panel-head"><div><p className="vault2-kicker">EVENTOS</p><h2>Destinos</h2></div><button className="vault2-primary-button" type="button" onClick={()=>openWebhookEditor("create")}>Novo webhook</button></div>
          <div className="vault2-table-wrap"><table><thead><tr><th>Nome</th><th>Destino</th><th>Eventos</th><th>Segurança</th><th>Status</th><th>Ações</th></tr></thead><tbody>
            {webhooks.length?webhooks.map(webhook=><tr key={webhook.id}>
              <td><strong>{webhook.name}</strong><small>{webhook.method}</small></td>
              <td><strong>{webhook.url}</strong><small>{webhook.headers.length} header(s) protegido(s)</small></td>
              <td><small>{webhook.events.join(", ")}</small></td>
              <td><StatusTag ok={webhook.secretConfigured} label={webhook.secretConfigured?"Segredo protegido":"Sem assinatura"}/></td>
              <td><StatusTag ok={webhook.active} label={webhook.active?"Ativo":"Inativo"}/></td>
              <td><div className="vault2-row-actions"><button type="button" onClick={()=>testWebhook(webhook)} disabled={webhookTesting===webhook.id}>{webhookTesting===webhook.id?"Testando…":"Testar"}</button><button type="button" onClick={()=>openWebhookEditor(webhook)}>Editar</button><button type="button" className="danger" disabled={webhookDeleting===webhook.id} onClick={()=>removeWebhook(webhook)}>{webhookDeleting===webhook.id?"Excluindo…":"Excluir"}</button></div></td>
            </tr>):<tr><td colSpan={6}>{webhooksLoaded?<EmptyState title="Nenhum webhook" text="Nenhum destino externo foi configurado. Nenhum disparo é simulado."/>:<span className="vault2-muted">Carregando webhooks…</span>}</td></tr>}
          </tbody></table></div>
        </div>
        {webhooks.map(webhook=><article className="vault2-panel vault2-delivery-panel" key={"delivery-"+webhook.id}>
          <div className="vault2-panel-head"><div><p className="vault2-kicker">HISTÓRICO / {webhook.name}</p><h2>Entregas</h2></div><span className="vault2-count">{webhook.events[0]||"sem evento"}</span></div>
          {(webhookDeliveries[webhook.id]||[]).length?<div className="vault2-delivery-list">{webhookDeliveries[webhook.id].map(delivery=><div key={delivery.id}><span>{dateTime(delivery.at)}</span><strong>{delivery.event}</strong><em className={delivery.status==="success"?"ok":"fail"}>{delivery.status==="success"?"HTTP "+delivery.statusCode:"Falha "+(delivery.error||"")}</em><small>{delivery.durationMs} ms · {delivery.attempts} tentativa(s)</small></div>)}</div>:<p className="vault2-muted">Nenhuma entrega carregada nesta sessão. O histórico persistido está disponível ao consultar o webhook.</p>}
        </article>)}
        {webhookEditor&&<div className="vault2-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target&&!webhookSaving)setWebhookEditor(null)}}>
          <section className="vault2-modal" role="dialog" aria-modal="true" aria-labelledby="webhook-editor-title">
            <div className="vault2-modal-head"><div><p className="vault2-kicker">{webhookEditor==="create"?"NOVO WEBHOOK":"EDITAR WEBHOOK"}</p><h2 id="webhook-editor-title">{webhookEditor==="create"?"Criar destino":"Editar destino"}</h2></div><button type="button" onClick={()=>setWebhookEditor(null)} disabled={webhookSaving} aria-label="Fechar">×</button></div>
            <div className="vault2-form-grid">
              <label>Nome<input value={webhookForm.name} onChange={event=>setWebhookForm({...webhookForm,name:event.target.value})} maxLength={120}/></label>
              <label>Método<select value={webhookForm.method} onChange={event=>setWebhookForm({...webhookForm,method:event.target.value as "POST"|"PUT"|"PATCH"})}><option>POST</option><option>PUT</option><option>PATCH</option></select></label>
              <label className="vault2-form-wide">URL HTTPS<input value={webhookForm.url} onChange={event=>setWebhookForm({...webhookForm,url:event.target.value})} maxLength={2048} placeholder="https://exemplo.com/webhook"/></label>
              <label className="vault2-form-wide">Segredo de assinatura {webhookEditor!=="create"&&<small>Deixe vazio para manter o segredo atual.</small>}<input type="password" autoComplete="new-password" value={webhookForm.secret} onChange={event=>setWebhookForm({...webhookForm,secret:event.target.value})} maxLength={256}/></label>
              <div className="vault2-form-wide"><p className="vault2-form-label">Eventos</p><div className="vault2-event-grid">{webhookEvents.map(event=><label key={event} className="vault2-event-option"><input type="checkbox" checked={webhookForm.events.includes(event)} onChange={change=>setWebhookForm(current=>({...current,events:change.target.checked?[...current.events,event]:current.events.filter(item=>item!==event)}))}/><span>{event}</span></label>)}</div></div>
              <label className="vault2-form-wide">Headers protegidos<small>Um por linha: Nome: valor. Valores são armazenados criptografados e nunca exibidos.</small><textarea rows={5} placeholder={webhookEditor!=="create"&&webhookEditor.headers.length?"Reinforme os headers protegidos para substituí-los: "+webhookEditor.headers.join(", "):"Authorization: Bearer …"} value={webhookForm.headers} onChange={event=>setWebhookForm({...webhookForm,headers:event.target.value})}/></label>
              <label className="vault2-toggle vault2-form-wide"><input type="checkbox" checked={webhookForm.active} onChange={event=>setWebhookForm({...webhookForm,active:event.target.checked})}/><span>Webhook ativo</span></label>
            </div>
            <div className="vault2-modal-actions"><button type="button" className="vault2-secondary-button" onClick={()=>setWebhookEditor(null)} disabled={webhookSaving}>Cancelar</button><button type="button" className="vault2-primary-button" onClick={saveWebhook} disabled={webhookSaving}>{webhookSaving?"Salvando…":webhookEditor==="create"?"Criar webhook":"Salvar alterações"}</button></div>
          </section>
        </div>}
      </section>;
    }

    if(active==="settings"){
      return <section className="vault2-page">
        <SectionIntro number="13" title="Configurações" description="Somente estado que pode ser derivado do backend atual é exibido aqui; segredos nunca são enviados para o client."/>
        <div className="vault2-settings-grid">
          <article className="vault2-panel vault2-settings-card"><div className="vault2-panel-head"><div><p className="vault2-kicker">LOJA</p><h2>Configuração da loja</h2></div><StatusTag ok={false} label="Ainda não configurado"/></div><div className="vault2-detail-list">{["Nome","Logo","Favicon","Moeda","Redes sociais","Emails","Termos","Privacidade"].map(item=><div key={item}><span>{item}</span><strong>Ainda não configurado</strong></div>)}</div></article>
          <article className="vault2-panel vault2-settings-card"><div className="vault2-panel-head"><div><p className="vault2-kicker">PROMISSE API</p><h2>Pagamentos</h2></div><StatusTag ok={data.paymentsConfigured}/></div><div className="vault2-detail-list"><div><span>API base</span><strong>{data.promiseBaseConfigured?"Configurada":"Ausente"}</strong></div><div><span>API key</span><strong>{data.promiseApiKeyConfigured?"Presente no servidor":"Ausente"}</strong></div><div><span>Webhook URL</span><strong>{data.promiseWebhookConfigured?"Presente":"Ausente"}</strong></div><div><span>Webhook secret</span><strong>{data.promiseWebhookSecretConfigured?"Presente no servidor":"Ausente"}</strong></div><div><span>Integração</span><strong>{data.paymentsConfigured&&data.promiseWebhookConfigured&&data.promiseWebhookSecretConfigured?"Ativa / configurada":"Incompleta"}</strong></div><div><span>Modo</span><strong>{data.promiseMode==="production"?"Produção":"Incompleta"}</strong></div><div><span>Sandbox</span><strong>{data.promiseSandboxDocumented?"Documentado":"Não documentado"}</strong></div><div><span>Escopos</span><strong>Não documentados</strong></div><div><span>Último erro</span><strong>{data.promiseLastError?dateTime(data.promiseLastError.at)+" · "+data.promiseLastError.event:"Nenhum erro registrado"}</strong></div><div><span>Última reconciliação</span><strong>{data.promiseLastReconciliationAt?dateTime(data.promiseLastReconciliationAt):"Nenhuma registrada"}</strong></div></div><p className="vault2-sensitive-note">Chave, secret, token e payload da Promisse nunca são enviados ao navegador.</p></article>
          <article className="vault2-panel vault2-settings-card"><div className="vault2-panel-head"><div><p className="vault2-kicker">HCAPTCHA</p><h2>Proteção anti-bot</h2></div><StatusTag ok={data.hcaptchaConfigured}/></div><div className="vault2-detail-list"><div><span>Configuração</span><strong>{data.hcaptchaConfigured?"Configurado no servidor":"Ainda não configurado"}</strong></div><div><span>Site key</span><strong>Não exibida ao client</strong></div><div><span>Validação</span><strong>Server-side</strong></div><div><span>Tentativas bloqueadas</span><strong>Nenhum dado disponível</strong></div></div><p className="vault2-sensitive-note">A chave secreta do hCaptcha nunca é exposta nesta interface.</p></article>
          <article className="vault2-panel vault2-settings-card"><div className="vault2-panel-head"><div><p className="vault2-kicker">SEGURANÇA</p><h2>Admin</h2></div><StatusTag ok={true} label="Ativo"/></div><div className="vault2-detail-list"><div><span>Autorização</span><strong>OWNER server-side</strong></div><div><span>Sessão</span><strong>HMAC assinada</strong></div><div><span>CSRF</span><strong>Ativo nas mutações administrativas</strong></div><div><span>Rate limiting</span><strong>Ativo</strong></div></div></article>
        </div>
      </section>;
    }

    if(active==="finance"){
      return <section className="vault2-page">
        <SectionIntro number="05" title="Financeiro" description="Resumo financeiro derivado somente de pedidos PAID persistidos. Nenhum valor é projetado ou inferido de pedidos pendentes."/>
        <div className="vault2-metric-grid">
          <article className="vault2-metric-card"><p>Receita reconhecida</p><strong>{money(orderMetrics.revenue)}</strong><span>Somente pedidos PAID</span></article>
          <article className="vault2-metric-card"><p>Pedidos pagos</p><strong>{orderMetrics.paid}</strong><span>Estado comercial PAID</span></article>
          <article className="vault2-metric-card"><p>Ticket médio pago</p><strong>{orderMetrics.paid?money(orderMetrics.revenue/orderMetrics.paid):money(0)}</strong><span>Receita / pedidos PAID</span></article>
          <article className="vault2-metric-card"><p>Pedidos não pagos</p><strong>{orderMetrics.pending+orderMetrics.failed+orderMetrics.cancelled+orderMetrics.expired}</strong><span>Não entram na receita</span></article>
          <article className="vault2-metric-card"><p>Reconciliação com erro</p><strong>{orderMetrics.reconciliationErrors}</strong><span>Exigem acompanhamento operacional</span></article>
        </div>
        <div className="vault2-grid-2">
          <article className="vault2-panel"><div className="vault2-panel-head"><div><p className="vault2-kicker">COBRANÇAS</p><h2>Distribuição por estado</h2></div></div><div className="vault2-detail-list">
            <div><span>PENDING</span><strong>{orderMetrics.pending}</strong></div>
            <div><span>PAID</span><strong>{orderMetrics.paid}</strong></div>
            <div><span>FAILED</span><strong>{orderMetrics.failed}</strong></div>
            <div><span>CANCELLED</span><strong>{orderMetrics.cancelled}</strong></div>
            <div><span>EXPIRED</span><strong>{orderMetrics.expired}</strong></div>
          </div></article>
          <article className="vault2-panel"><div className="vault2-panel-head"><div><p className="vault2-kicker">LIMITES DO DADO</p><h2>O que não é calculado</h2></div></div><p className="vault2-muted">Não há série histórica financeira separada, método de pagamento, estornos ou taxa de conversão persistidos. A receita mostrada aqui é apenas a soma do total dos pedidos PAID.</p></article>
        </div>
      </section>;
    }
    return <Unsupported title="Área" description="Área administrativa sem operações adicionais habilitadas."/>;
  }

  return <main className="vault2-shell">
    {mobileOpen&&<button className="vault2-backdrop" type="button" aria-label="Fechar menu" onClick={()=>setMobileOpen(false)}/>}
    <aside className={"vault2-sidebar "+(collapsed?"is-collapsed":"")+(mobileOpen?" is-mobile-open":"")}>
      <div className="vault2-sidebar-top">
        <button className="vault2-brand" type="button" onClick={()=>goTo("overview")} aria-label="Ir para Overview">
          <span className="vault2-brand-mark">S</span>
          <span><strong>SHINY</strong><small>OWNER CONSOLE</small></span>
        </button>
        <button className="vault2-collapse" type="button" onClick={()=>setCollapsed(value=>!value)} aria-label={collapsed?"Expandir sidebar":"Recolher sidebar"}>{collapsed?"→":"←"}</button>
      </div>
      <nav className="vault2-nav" aria-label="Administração">
        {(["Operação","Conteúdo","Inteligência"] as const).map(group=><div className="vault2-nav-group" key={group}>
          {!collapsed&&<p>{group}</p>}
          {sections.filter(item=>item.group===group).map(item=><button key={item.id} type="button" className={active===item.id?"is-active":""} onClick={()=>goTo(item.id)} title={collapsed?item.label:undefined}><span>{item.short}</span><strong>{item.label}</strong></button>)}
        </div>)}
      </nav>
      <div className="vault2-sidebar-bottom">
        <div className="vault2-owner-mini"><span>O</span><div><strong>OWNER</strong><small>Autorizado</small></div></div>
        <button className="vault2-logout" type="button" disabled={loggingOut} onClick={logout}><span>↗</span>{!collapsed&&(loggingOut?"Encerrando…":"Logout")}</button>
      </div>
    </aside>

    <section className="vault2-main">
      <header className="vault2-topbar">
        <div className="vault2-topbar-left">
          <button className="vault2-menu" type="button" aria-label="Abrir menu" onClick={()=>setMobileOpen(true)}>☰</button>
          <div className="vault2-breadcrumb" aria-label="Breadcrumb"><span>Admin</span><b>/</b><strong>{current.label}</strong></div>
        </div>
        <div className="vault2-topbar-right">
          <div className="vault2-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&filteredSections[0])goTo(filteredSections[0].id)}} placeholder="Buscar área…" aria-label="Buscar áreas administrativas"/></div>
          <span className="vault2-owner-pill"><i aria-hidden="true"/> OWNER</span>
          <button className="vault2-top-logout" type="button" onClick={logout} disabled={loggingOut}>{loggingOut?"Encerrando…":"Logout"}</button>
        </div>
      </header>

      {query&&<div className="vault2-search-results">{filteredSections.length?filteredSections.map(item=><button key={item.id} type="button" onClick={()=>goTo(item.id)}><span>{item.short}</span><strong>{item.label}</strong><small>{item.group}</small></button>):<p>Nenhuma área encontrada.</p>}</div>}

      <div className="vault2-content">
        {renderSection()}
      </div>
      <footer className="vault2-footer"><span>SHINY / OWNER CONSOLE</span><span>Autorização OWNER aplicada no servidor</span></footer>
    </section>

    {toast&&<div className={"vault2-toast "+toast.kind} role="status"><span>{toast.kind==="success"?"✓":toast.kind==="error"?"×":"i"}</span><p>{toast.text}</p><button type="button" onClick={()=>setToast(null)} aria-label="Fechar aviso">×</button></div>}
  </main>;
}
