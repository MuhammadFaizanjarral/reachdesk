import {lookup} from 'node:dns/promises';
import {isIP,type LookupFunction} from 'node:net';
import {request} from 'node:https';
import {Readable} from 'node:stream';

export function isPublicAddress(address:string):boolean{
 if(isIP(address)===4){
  const [a,b,c]=address.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===192&&b===0&&(c===0||c===2))||(a===192&&b===88&&c===99)||(a===198&&(b===18||b===19))||(a===198&&b===51&&c===100)||(a===203&&b===0&&c===113));
 }
 if(isIP(address)===6){
  const [first,second]=address.toLowerCase().split(':').map(x=>parseInt(x||'0',16));
  return first>=0x2000&&first<0x4000&&first!==0x2002&&!(first===0x2001&&(second<0x200||second===0xdb8));
 }
 return false;
}
export async function resolvePublicDestination(hostname:string,signal?:AbortSignal|null){
 signal?.throwIfAborted();
 const result=lookup(hostname,{all:true,verbatim:true});
 const answers=await new Promise<Awaited<typeof result>>((resolve,reject)=>{
  const abort=()=>reject(new DOMException('Aborted','AbortError'));
  if(signal?.aborted){abort();return}
  signal?.addEventListener('abort',abort,{once:true});
  result.then(resolve,reject).finally(()=>signal?.removeEventListener('abort',abort));
 });
 if(!answers.length||answers.some(a=>!isPublicAddress(a.address)))throw new Error('The website resolves to a non-public network destination.');
 return answers.find(a=>a.family===4)??answers[0];
}

/** Resolve, validate, and pin the actual socket destination for every request. */
export const securePublicFetch:typeof fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))throw new Error('Only public HTTPS websites on port 443 can be audited.');
 if(init?.method&&init.method!=='GET')throw new Error('Website audits support GET only.');
 const pinned=await resolvePublicDestination(url.hostname,init?.signal);
 init?.signal?.throwIfAborted();
 const resolver:LookupFunction=(_hostname,options,callback)=>{
  if(options.all)(callback as unknown as (error:null,addresses:{address:string;family:number}[])=>void)(null,[pinned]);
  else callback(null,pinned.address,pinned.family);
 };
 return new Promise<Response>((resolve,reject)=>{
  const req=request(url,{method:'GET',agent:false,lookup:resolver,signal:init?.signal??undefined,headers:Object.fromEntries(new Headers(init?.headers))},res=>{
   const headers=new Headers();for(const [key,value] of Object.entries(res.headers))if(value!==undefined&&key!=='set-cookie')headers.set(key,Array.isArray(value)?value.join(', '):value);
   const status=res.statusCode??502;
   resolve(new Response([204,205,304].includes(status)?null:Readable.toWeb(res) as ReadableStream<Uint8Array>,{status,headers}));
  });
  req.on('error',reject);req.end();
 });
};
