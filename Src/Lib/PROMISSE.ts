export type PromisseTransaction={id:string;status:string;amount:number;copyPaste:string;qrCodeBase64:string;expiresAt?:string};
export type PromisseLookupTransaction={id:string;status:"pending"|"PAID";amount:number;type?:string;expiresAt?:string};

export async function createPromisseTransaction(base:string,apiKey:string,amount:number,webhook:string,fetchImpl:typeof fetch=fetch){
  const response=await fetchImpl(base.replace(/\/$/,"")+"/transactions",{
    method:"POST",
    headers:{Authorization:apiKey,"Content-Type":"application/json"},
    body:JSON.stringify({amount,webhook}),
    cache:"no-store"
  });
  const data=await response.json().catch(()=>null);
  return {response,data};
}

export function parsePromisseTransaction(status:number,data:unknown,expectedAmount:number):PromisseTransaction{
  if(status!==201||typeof data!=="object"||!data)throw new Error("provider_response_invalid");
  const value=data as Record<string,unknown>;
  if(typeof value.id!=="string"||typeof value.status!=="string"||typeof value.amount!=="number"||typeof value.copyPaste!=="string"||typeof value.qrCodeBase64!=="string")throw new Error("provider_response_invalid");
  if(value.amount!==expectedAmount)throw new Error("provider_amount_mismatch");
  if(value.status.toLowerCase()!=="pending")throw new Error("provider_status_invalid");
  return {id:value.id,status:value.status,amount:value.amount,copyPaste:value.copyPaste,qrCodeBase64:value.qrCodeBase64,expiresAt:typeof value.expiresAt==="string"?value.expiresAt:undefined};
}

export function parsePromisseLookup(status:number,data:unknown,expectedAmount:number,expectedId:string):PromisseLookupTransaction{
  if(status!==200||typeof data!=="object"||!data)throw new Error("provider_response_invalid");
  const value=data as Record<string,unknown>;
  if(typeof value.id!=="string"||value.id!==expectedId)throw new Error("provider_id_mismatch");
  if(typeof value.status!=="string")throw new Error("provider_status_missing");
  if(typeof value.amount!=="number"||!Number.isSafeInteger(value.amount)||value.amount!==expectedAmount)throw new Error("provider_amount_mismatch");
  if(value.type!==undefined&&(typeof value.type!=="string"||value.type.toUpperCase()!=="DEPOSIT"))throw new Error("provider_type_invalid");
  const normalized=value.status.toLowerCase();
  if(normalized==="paid"&&value.status==="PAID")return {id:value.id,status:"PAID",amount:value.amount,type:typeof value.type==="string"?value.type:undefined,expiresAt:typeof value.expiresAt==="string"?value.expiresAt:undefined};
  if(normalized==="pending")return {id:value.id,status:"pending",amount:value.amount,type:typeof value.type==="string"?value.type:undefined,expiresAt:typeof value.expiresAt==="string"?value.expiresAt:undefined};
  throw new Error("provider_status_invalid");
}
