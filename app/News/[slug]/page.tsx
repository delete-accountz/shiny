import Link from "next/link";
import {notFound} from "next/navigation";
import {readPublishedPost} from "@/Lib/POSTS";
import type {Metadata} from "next";

export const dynamic="force-dynamic";
export const revalidate=0;

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params;const post=await readPublishedPost(slug);if(!post)return {title:"News — Shiny"};
  return {title:post.seoTitle||post.title,description:post.seoDescription||post.summary};
}
export default async function NewsPost({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;const post=await readPublishedPost(slug);if(!post)notFound();
  const paragraphs=post.content.split(/\n\s*\n/).map(item=>item.trim()).filter(Boolean);
  return <main className="public-news-post-page">
    <header className="public-news-header"><Link href="/News" className="public-news-back">← News</Link><span>{post.category}</span></header>
    <article className="public-news-post">
      <p className="vault2-kicker">SHINY / {post.category.toUpperCase()}</p>
      <h1>{post.title}</h1><p className="public-news-summary">{post.summary}</p>
      <div className="public-news-meta">{new Intl.DateTimeFormat("pt-BR",{dateStyle:"long"}).format(new Date(post.publishedAt||post.updatedAt))}</div>
      {post.image&&<img className="public-news-hero" src={post.image} alt="" />}
      <div className="public-news-body">{paragraphs.map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div>
    </article>
  </main>;
}
