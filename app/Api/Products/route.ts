import {NextResponse} from "next/server";
import {readProducts} from "@/Lib/ADMIN_STORE";

export const dynamic="force-dynamic";

export async function GET(){
  try{
    const catalog=(await readProducts()).filter(product=>product.active!==false).map(product=>({
      id:product.id,
      name:product.name,
      price:product.price,
      description:product.description,
      image:product.image||""
    }));
    return NextResponse.json({products:catalog},{headers:{"cache-control":"no-store"}});
  }catch{
    return NextResponse.json({error:"catalog_unavailable"},{status:503});
  }
}
