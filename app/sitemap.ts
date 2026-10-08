import type {MetadataRoute} from "next";
import {readPublishedPosts} from "@/Lib/POSTS";

export const dynamic="force-dynamic";
export const revalidate=0;

export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  const posts=await readPublishedPosts();
  return [
    {url:"/",lastModified:new Date()},
    {url:"/News",lastModified:posts[0]?new Date(posts[0].updatedAt):new Date()},
    ...posts.map(post=>({url:"/News/"+post.slug,lastModified:new Date(post.updatedAt)}))
  ];
}
