export default function NotFound(){
  return <main className="not-found-page">
    <div className="not-found-noise" aria-hidden="true"/>
    <div className="not-found-orbit not-found-orbit-a" aria-hidden="true"/>
    <div className="not-found-orbit not-found-orbit-b" aria-hidden="true"/>
    <section className="not-found-card" aria-labelledby="not-found-title">
      <div className="not-found-topline"><span>SHINY</span><span>404</span></div>
      <div className="not-found-symbol" aria-hidden="true"><span>4</span><i>0</i><span>4</span></div>
      <p className="not-found-eyebrow">THE PAGE COULD NOT BE FOUND</p>
      <h1 id="not-found-title">Esta página<br/><em>não existe.</em></h1>
      <p className="not-found-copy">O endereço que você tentou acessar não está disponível. Volte para a loja e continue explorando a Shiny.</p>
      <div className="not-found-actions"><a className="not-found-primary" href="/">Voltar para a loja <span aria-hidden="true">↗</span></a><a className="not-found-secondary" href="/">Ir para início</a></div>
      <div className="not-found-footer"><span>SHINY / DIGITAL GOODS</span><span>404 / NOT FOUND</span></div>
    </section>
  </main>;
}
