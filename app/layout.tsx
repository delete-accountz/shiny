import type {Metadata} from "next";
import "./globals.css";

export const metadata:Metadata={
 title:"Shiny",
 description:"Shiny Store",
 openGraph:{title:"Shiny",description:"Shiny Store.",type:"website"},
 icons:{icon:"/favicon.ico",shortcut:"/favicon.ico"}
};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="pt-BR"><body>{children}</body></html>;
}