"use client";
import logoSrc from "../Public/Assets/Shiny0Fundo.png";
import bannerSrc from "../Public/Assets/ShinyBanner.png";
type Props={lang:"pt"|"en";onProducts:()=>void};
export default function HomeExperience({lang,onProducts}:Props){
const pt=lang==="pt";
return <section className="hero" aria-labelledby="hero-title">
<div className="hero-art" aria-label={pt?"Banner Shiny":"Shiny banner"}>
<img className="hero-banner" src={bannerSrc.src} alt="" width={1600} height={900} fetchPriority="high" decoding="async"/>
<div className="hero-3d-layer" aria-hidden="true">
<div className="depth-plane depth-back"><span className="depth-grid"/></div>
<div className="depth-plane depth-middle"><span className="depth-ring"/><span className="depth-glow"/></div>
<div className="rotating-object"><span/><span/><span/><span/><span/><span/></div>
<div className="floating-object"><span/><span/><span/></div>
</div>
<div className="hero-logo-wrap"><img className="hero-logo" src={logoSrc.src} alt="Shiny" width={260} height={260} decoding="async"/></div>
<span className="hero-mark hero-mark-a" aria-hidden="true"/>
<span className="hero-mark hero-mark-b" aria-hidden="true"/>
</div>
<div className="hero-copy">
<p className="eyebrow">SHINY / DIGITAL GOODS</p>
<h1 id="hero-title">{pt?"A experiência Shiny começa aqui.":"The Shiny experience starts here."}</h1>
<p>{pt?"Produtos digitais com presença, precisão e uma interface feita para desaparecer entre você e o que comprou.":"Digital products with presence, precision and an interface designed to disappear between you and what you bought."}</p>
<div className="hero-actions"><button className="primary" onClick={onProducts}>{pt?"Ver produtos":"Explore products"}</button><span>{pt?"ENTREGA DIGITAL":"DIGITAL DELIVERY"}</span></div>
<div className="hero-meta"><span>{pt?"FEITO PARA PERFORMANCE":"BUILT FOR PERFORMANCE"}</span><span>{pt?"SUPORTE OFICIAL":"OFFICIAL SUPPORT"}</span></div>
</div>
</section>;
}