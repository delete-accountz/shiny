import type {Order,OrderStatus,PaymentProviderStatus} from "./ORDERS";

export type PublicOrderItem={productId:string;name:string;quantity:number;unitPrice:number};
export type PublicOrder={
  orderId:string;
  status:OrderStatus;
  items:PublicOrderItem[];
  total:number;
  currency:"BRL";
  paymentStatus?:PaymentProviderStatus;
  transactionIdMasked?:string;
  payment?:{copyPaste:string;qrCodeBase64:string};
  expiresAt?:string;
  createdAt:string;
  updatedAt:string;
  isVisuallyExpired:boolean;
  reconciliationRequired:boolean;
  message:string;
};

const PENDING_RECONCILIATION_AGE_MS=30*60_000;

export function maskTransactionId(value:string){
  if(!value)return undefined;
  return value.length<=4?"••••":"••••"+value.slice(-4);
}

function providerStatusFor(order:Order):PaymentProviderStatus|undefined{
  if(order.providerStatus)return order.providerStatus;
  if(order.status==="PAID")return "PAID";
  if(order.status==="FAILED")return "payment.failed";
  if(order.status==="PENDING")return "pending";
  return undefined;
}

export function toPublicOrder(order:Order,now=new Date()):PublicOrder{
  const expiresAt=typeof order.expiresAt==="string"&&order.expiresAt.trim()?order.expiresAt:undefined;
  const expiresMs=expiresAt?Date.parse(expiresAt):NaN;
  const isVisuallyExpired=order.status==="PENDING"&&Number.isFinite(expiresMs)&&expiresMs<=now.getTime();
  const ageMs=Math.max(0,now.getTime()-Date.parse(order.createdAt));
  const reconciliationRequired=order.status==="PENDING"&&(isVisuallyExpired||Boolean(order.lastReconciliationError)||ageMs>=PENDING_RECONCILIATION_AGE_MS);
  let message:string;
  if(order.status==="PENDING"&&isVisuallyExpired){
    message="O prazo visual do QR Code terminou. O pagamento ainda não foi confirmado; atualize o pedido para reconciliar no servidor.";
  }else if(order.status==="PENDING"){
    message=reconciliationRequired?"Pagamento pendente. O pedido requer reconciliação server-side.":"Pagamento pendente. A confirmação é feita pelo servidor.";
  }else if(order.status==="PAID"){
    message="Pagamento confirmado.";
  }else if(order.status==="FAILED"){
    message="Pagamento não confirmado pela Promisse.";
  }else if(order.status==="CANCELLED"){
    message="Pedido cancelado localmente.";
  }else{
    message="Pedido encerrado localmente. A expiração financeira não é inferida apenas pelo prazo visual.";
  }
  const payment=order.status==="PENDING"&&!isVisuallyExpired&&order.copyPaste&&order.qrCodeBase64
    ?{copyPaste:order.copyPaste,qrCodeBase64:order.qrCodeBase64}
    :undefined;
  return {
    orderId:order.id,
    status:order.status,
    items:order.items.map(item=>({productId:item.productId,name:item.name,quantity:item.quantity,unitPrice:item.unitPrice})),
    total:order.total,
    currency:"BRL",
    paymentStatus:providerStatusFor(order),
    transactionIdMasked:maskTransactionId(order.transactionId||""),
    payment,
    expiresAt,
    createdAt:order.createdAt,
    updatedAt:order.updatedAt,
    isVisuallyExpired,
    reconciliationRequired,
    message
  };
}

export function publicOrderList(orders:Order[],limit=50){
  return orders
    .slice()
    .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
    .slice(0,Math.max(1,Math.min(50,limit)))
    .map(order=>toPublicOrder(order));
}
