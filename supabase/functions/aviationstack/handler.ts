import {normalizeFlightNumber,parseFlightPayload,STATUS_CACHE_MS} from '../_shared/aviation.ts';
export interface AviationDependencies {
 origins:string[];keyConfigured:boolean;now:()=>number;
 authenticate:(authorization:string)=>Promise<string|null>;
 reserve:(code:string,user:string)=>Promise<{cached?:boolean;pending?:boolean;payload?:unknown}>;
 provider:(code:string)=>Promise<{ok:boolean;body:unknown}>;
 cache:(code:string,payload:unknown,expiresAt:string)=>Promise<void>;
 release:(code:string)=>Promise<void>;
}
export function createAviationHandler(deps:AviationDependencies){
 return async(req:Request):Promise<Response>=>{
  const origin=req.headers.get('Origin')||'';
  const headers:Record<string,string>={'Content-Type':'application/json','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
  if(origin&&deps.origins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!deps.origins.includes(origin))return json({error:'This website is not permitted to use flight status. Ask your administrator to configure its allowed origin.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return json({error:'POST required'},405);
  let leasedCode='';
  try{
   const user=await deps.authenticate(req.headers.get('Authorization')||'');
   if(!user)return json({error:'Sign in with a provisioned employee account to check flight status.'},401);
   const raw=await req.text();if(raw.length>1024)return json({error:'Request too large'},400);
   let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}
   let code:string;try{code=normalizeFlightNumber(String(body?.flight_iata??''));}catch{return json({error:'Use an IATA flight number such as PR2845 or 5J563.'},400);}
   if(!deps.keyConfigured)return json({error:'The flight data service key is not configured. Ask your administrator to set AVIATIONSTACK_API_KEY.'},503);
   let reservation;try{reservation=await deps.reserve(code,user);}catch{return json({error:'The lookup budget or rate limit has been reached. Wait a minute before another uncached lookup, or contact your administrator.'},429);}
   if(reservation.cached){
    const cached=reservation.payload as {fetchedAt?:string};
    const data=parseFlightPayload(cached);
    if(!cached?.fetchedAt||!Number.isFinite(Date.parse(cached.fetchedAt)))return json({error:'The cached flight response is invalid. Please try again after the cache expires.'},502);
    return json({data,fetchedAt:cached.fetchedAt,cached:true});
   }
   if(reservation.pending)return json({error:'A lookup for this flight is already in progress. Please try again in a few seconds.'},429);
   leasedCode=code;
   const response=await deps.provider(code);
   const data=parseFlightPayload(response.body);
   if(!response.ok)return json({error:'The flight data service is temporarily unavailable. Please try again later.'},502);
   const fetchedAt=deps.now();const result={data,fetchedAt:new Date(fetchedAt).toISOString()};
   await deps.cache(code,result,new Date(fetchedAt+STATUS_CACHE_MS).toISOString());
   return json({...result,cached:false});
  }catch(issue){
   const message=issue instanceof Error?issue.message:'';
   // Only known sanitized parser messages are surfaced; never echo provider URLs or keys.
   return json({error:message.startsWith('The flight data service ')?message:'Flight status is temporarily unavailable. Please try again later.'},502);
  }finally{if(leasedCode)await deps.release(leasedCode).catch(()=>{});}
 };
}
