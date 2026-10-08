export type CartInput={productId:string;quantity:number};
export function aggregateCartItems(items:CartInput[]){
  const aggregated=new Map<string,number>();
  for(const item of items){
    if(!Number.isSafeInteger(item.quantity)||item.quantity<1)return null;
    const next=(aggregated.get(item.productId)||0)+item.quantity;
    if(!Number.isSafeInteger(next)||next>100000)return null;
    aggregated.set(item.productId,next);
  }
  return [...aggregated.entries()].map(([productId,quantity])=>({productId,quantity}));
}
