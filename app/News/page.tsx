import Link from "next/link";
import {readPublishedPosts} from "@/Lib/POSTS";

export const dynamic="force-dynamic";
export const revalidate=0;

export default async function News(){
  const posts=await readPublishedPosts();
  return <main className="public-news-page">
    <header className="public-news-header"><Link href="/" className="public-news-back">SHINY STORE</Link><span>NEWS</span></header>
    <section className="public-news-content">
      <div className="public-news-intro"><p className="vault2-kicker">SHINY / NEWS</p><h1>News</h1><p>Atualizações e publicações da Shiny.</p></div>
      {posts.length?<div className="public-news-grid">{posts.map(post=><article className="public-news-card" key={post.id}>
        {post.image&&<img src={post.image} alt="" loading="lazy"/>}
        <div><span>{post.category}</span><small>{new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium"}).format(new Date(post.publishedAt||post.updatedAt))}</small><h2>{post.title}</h2><p>{post.summary}</p><Link href={"/News/"+post.slug}>Ler publicação ↗</Link></div>
      </article>)}</div>:<div className="public-news-empty"><strong>Nenhuma publicação</strong><p>Ainda não há notícias publicadas.</p></div>}
    </section>
  </main>;
}
