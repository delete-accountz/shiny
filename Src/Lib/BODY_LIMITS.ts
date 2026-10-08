export type BodyReadResult={ok:true;body:string}|{ok:false;reason:"too_large"|"invalid_body"|"invalid_json"};

function contentLength(request:Request){
  const value=request.headers.get("content-length");
  if(value===null)return null;
  if(!/^\\d+$/.test(value))return -1;
  const parsed=Number(value);
  return Number.isSafeInteger(parsed)?parsed:-1;
}

export async function readRawBody(request:Request,maxBytes:number):Promise<BodyReadResult>{
  const declared=contentLength(request);
  if(declared===-1||declared!==null&&declared>maxBytes)return {ok:false,reason:"too_large"};
  try{
    const reader=request.body?.getReader();
    if(!reader)return {ok:true,body:""};
    const chunks:Uint8Array[]=[];let total=0;
    while(true){
      const part=await reader.read();
      if(part.done)break;
      total+=part.value.byteLength;
      if(total>maxBytes){await reader.cancel();return {ok:false,reason:"too_large"};}
      chunks.push(part.value);
    }
    const merged=new Uint8Array(total);let offset=0;
    for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}
    return {ok:true,body:new TextDecoder().decode(merged)};
  }catch{return {ok:false,reason:"invalid_body"};}
}

export async function readJsonBody(request:Request,maxBytes:number):Promise<BodyReadResult>{
  const result=await readRawBody(request,maxBytes);
  if(!result.ok)return result;
  try{JSON.parse(result.body);return result;}catch{return {ok:false,reason:"invalid_json"};}
}

export async function parseJsonBody<T=unknown>(request:Request,maxBytes:number):Promise<{ok:true;data:T}|{ok:false;reason:"too_large"|"invalid_body"|"invalid_json"}>{
  const result=await readRawBody(request,maxBytes);
  if("reason" in result)return {ok:false,reason:result.reason};
  try{return {ok:true,data:JSON.parse(result.body) as T};}catch{return {ok:false,reason:"invalid_json"};}
}
