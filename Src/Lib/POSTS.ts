import {mkdir,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import * as dbPosts from "./DB/POSTS";
const databaseMode=()=>process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true";

export type PostStatus="draft"|"published"|"scheduled";
export type Post={id:string;slug:string;title:string;summary:string;content:string;image?:string;category:string;status:PostStatus;publishedAt?:string;scheduledAt?:string;seoTitle?:string;seoDescription?:string;createdAt:string;updatedAt:string};
export type PostInput={title:string;slug:string;summary:string;content:string;image?:string;category:string;status:PostStatus;scheduledAt?:string;seoTitle?:string;seoDescription?:string};

const postsPath=path.join(process.cwd(),"Storage","posts.json");
let chain:Promise<void>=Promise.resolve();

async function readStored():Promise<Post[]>{
  try{return JSON.parse((await readFile(postsPath,"utf8")).replace(/^\uFEFF/,"")) as Post[];}
  catch(error){const code=error&&typeof error==="object"&&"code" in error?(error as {code?:string}).code:undefined;if(code==="ENOENT")return [];throw error;}
}
async function persist(posts:Post[]){
  await mkdir(path.dirname(postsPath),{recursive:true});const tmp=postsPath+"."+randomUUID()+".tmp";
  await writeFile(tmp,JSON.stringify(posts,null,2)+"\n","utf8");await rename(tmp,postsPath);
}
async function lock<T>(operation:()=>Promise<T>):Promise<T>{const previous=chain;let release!:()=>void;chain=new Promise(resolve=>{release=resolve});await previous;try{return await operation();}finally{release();}}
export function normalizeSlug(value:string){return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,100);}
export async function readPosts(){return databaseMode()?dbPosts.readPosts():readStored();}
export async function createPost(input:PostInput){
  if(databaseMode())return dbPosts.createPost(input);
  return lock(async()=>{const posts=await readStored();let slug=normalizeSlug(input.slug||input.title);if(!slug)slug="post";const base=slug;let index=2;while(posts.some(post=>post.slug===slug)){slug=base+"-"+index;index++;}const now=new Date().toISOString();const post:Post={id:randomUUID(),...input,slug,createdAt:now,updatedAt:now,publishedAt:input.status==="published"?now:undefined};await persist([...posts,post]);return post;});
}
export async function updatePost(id:string,input:PostInput){
  if(databaseMode())return dbPosts.updatePost(id,input);
  return lock(async()=>{const posts=await readStored();const index=posts.findIndex(post=>post.id===id);if(index<0)return null;const current=posts[index];const slug=normalizeSlug(input.slug||input.title)||current.slug;const duplicate=posts.some((post,postIndex)=>postIndex!==index&&post.slug===slug);if(duplicate)return "duplicate_slug" as const;const post:Post={...current,...input,id,slug,updatedAt:new Date().toISOString(),publishedAt:input.status==="published"?(current.publishedAt||new Date().toISOString()):undefined};const next=[...posts];next[index]=post;await persist(next);return post;});
}
export async function deletePost(id:string){if(databaseMode())return dbPosts.deletePost(id);return lock(async()=>{const posts=await readStored();if(!posts.some(post=>post.id===id))return false;await persist(posts.filter(post=>post.id!==id));return true;});}
export function isPublicPost(post:Post,now=new Date()){if(post.status==="published")return !post.publishedAt||new Date(post.publishedAt)<=now;if(post.status==="scheduled"&&post.scheduledAt)return new Date(post.scheduledAt)<=now;return false;}
export async function readPublishedPosts(){return databaseMode()?dbPosts.readPublishedPosts():(await readStored()).filter(post=>isPublicPost(post)).sort((a,b)=>Date.parse(b.publishedAt||b.updatedAt)-Date.parse(a.publishedAt||a.updatedAt));}
export async function readPublishedPost(slug:string){if(databaseMode())return dbPosts.readPublishedPost(slug);return (await readPublishedPosts()).find(post=>post.slug===slug)||null;}
