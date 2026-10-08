import {isIP} from "node:net";

function mappedIpv4(ip:string){
  if(isIP(ip)!==6)return null;
  const parts=ip.toLowerCase().split("::");
  if(parts.length>2)return null;
  const parsePart=(part:string)=>{
    if(!part)return [] as number[];
    const words:number[]=[];
    for(const piece of part.split(":")){
      if(piece.includes(".")){
        const octets=piece.split(".").map(Number);
        if(octets.length!==4||octets.some(value=>!Number.isInteger(value)||value<0||value>255))return null;
        words.push((octets[0]<<8)|octets[1],(octets[2]<<8)|octets[3]);
      }else{
        if(!/^[0-9a-f]{1,4}$/.test(piece))return null;
        words.push(parseInt(piece,16));
      }
    }
    return words;
  };
  const left=parsePart(parts[0]);if(left===null)return null;
  const right=parsePart(parts[1]||"");if(right===null)return null;
  const words=parts.length===2?[...left,...Array(8-left.length-right.length).fill(0),...right]:left;
  if(words.length!==8)return null;
  const isMapped=words.slice(0,5).every(value=>value===0)&&words[5]===0xffff;
  const isCompatible=words.slice(0,6).every(value=>value===0);
  if(!isMapped&&!isCompatible)return null;
  return [(words[6]>>8)&255,words[6]&255,(words[7]>>8)&255,words[7]&255].join(".");
}

function privateIpv4(ip:string){
  const n=ip.split(".").map(Number);
  if(n.length!==4||n.some(value=>!Number.isInteger(value)||value<0||value>255))return true;
  return n[0]===0||n[0]===10||n[0]===127||n[0]>=224||n[0]===169&&n[1]===254||n[0]===172&&n[1]>=16&&n[1]<=31||n[0]===192&&n[1]===168||n[0]===100&&n[1]>=64&&n[1]<=127||n[0]===192&&n[1]===0&&n[2]===0||n[0]===192&&n[1]===0&&n[2]===2||n[0]===192&&n[1]===88&&n[2]===99||n[0]===198&&n[1]===51&&n[2]===100||n[0]===203&&n[1]===0&&n[2]===113||n[0]===198&&n[1]>=18&&n[1]<=19;
}

export function isBlockedAddress(ip:string){
  if(isIP(ip)===4)return privateIpv4(ip);
  if(isIP(ip)!==6)return true;
  const mapped=mappedIpv4(ip);if(mapped)return privateIpv4(mapped);
  const value=ip.toLowerCase();
  return value==="::1"||value==="::"||value.startsWith("fc")||value.startsWith("fd")||value.startsWith("fe8")||value.startsWith("fe9")||value.startsWith("fea")||value.startsWith("feb")||value.startsWith("ff");
}
