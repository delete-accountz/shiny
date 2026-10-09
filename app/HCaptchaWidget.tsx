"use client";
import {useEffect,useRef,useState} from "react";
declare global {interface Window {hcaptcha?:{render:(element:HTMLElement,options:Record<string,unknown>)=>string;reset:(id:string)=>void;remove:(id:string)=>void;};}}
let scriptPromise:Promise<void>|null=null;
function loadHCaptcha():Promise<void>{
 if(window.hcaptcha)return Promise.resolve();
 if(scriptPromise)return scriptPromise;
 scriptPromise=new Promise<void>((resolve,reject)=>{
  let script=document.querySelector<HTMLScriptElement>('script[data-hcaptcha="true"]');
  if(script?.dataset.hcaptchaLoaded==="true"&&!window.hcaptcha){script.remove();script=null;}
  const onLoad=()=>{if(window.hcaptcha){script!.dataset.hcaptchaLoaded="true";resolve();}else reject(new Error("hcaptcha_api_unavailable"));};
  const onError=()=>reject(new Error("hcaptcha_script"));
  if(script){script.addEventListener("load",onLoad,{once:true});script.addEventListener("error",onError,{once:true});return;}
  script=document.createElement("script");script.src="https://js.hcaptcha.com/1/api.js?render=explicit";script.async=true;script.defer=true;script.dataset.hcaptcha="true";
  script.addEventListener("load",onLoad,{once:true});script.addEventListener("error",onError,{once:true});document.head.appendChild(script);
 }).catch(error=>{scriptPromise=null;const failed=document.querySelector<HTMLScriptElement>('script[data-hcaptcha="true"]');if(failed&&!window.hcaptcha)failed.remove();throw error;});
 return scriptPromise;
}
export default function HCaptchaWidget({onToken,theme="auto",resetSignal=0}:{onToken:(token:string)=>void;theme:"auto"|"light"|"dark";resetSignal?:number}){const ref=useRef<HTMLDivElement>(null);const widget=useRef<string|null>(null);const [error,setError]=useState("");const siteKey=process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim();useEffect(()=>{if(!siteKey){setError("CAPTCHA não configurado.");onToken("");return;}let disposed=false;setError("");loadHCaptcha().then(()=>{if(disposed||!ref.current||!window.hcaptcha)return;widget.current=window.hcaptcha.render(ref.current,{sitekey:siteKey,theme:theme==="auto"?"light":theme,callback:(token:string)=>{setError("");onToken(token);},"error-callback":()=>{setError("Não foi possível carregar o CAPTCHA. Tente novamente.");onToken("");},"expired-callback":()=>onToken(""),"chalexpired-callback":()=>onToken("")});}).catch(()=>{if(!disposed){setError("Não foi possível carregar o CAPTCHA. Tente novamente.");onToken("");}});return()=>{disposed=true;if(widget.current&&window.hcaptcha){window.hcaptcha.remove(widget.current);widget.current=null;}};},[siteKey,theme,onToken]);useEffect(()=>{if(resetSignal===0||!widget.current||!window.hcaptcha)return;window.hcaptcha.reset(widget.current);onToken("");setError("");},[resetSignal,onToken]);return <div className="hcaptcha-wrap"><div ref={ref}/>{error&&<p className="auth-error" role="alert">{error}</p>}</div>;}
