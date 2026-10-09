import type {Metadata} from "next";
import "./globals.css";

// CSP nonces are generated per request by proxy.ts. Prevent static HTML caching
// so Next.js can attach the matching nonce to its framework and inline scripts.
export const dynamic="force-dynamic";

export const metadata:Metadata={
 title:"Shiny",
 description:"Shiny Store",
 openGraph:{title:"Shiny",description:"Shiny Store.",type:"website"},
 icons:{icon:"/favicon.ico",shortcut:"/favicon.ico"}
};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="pt-BR"><body>{children}</body></html>;
}