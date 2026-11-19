import {supabase} from './supabase';
import {parseFlightPayload,STATUS_CACHE_MS,type FlightStatusResult} from './aviation';
export const flightStatusQuerySettings={staleTime:STATUS_CACHE_MS,gcTime:STATUS_CACHE_MS,retry:false,refetchOnWindowFocus:false,refetchOnMount:false,refetchOnReconnect:false,refetchInterval:false,networkMode:'always'} as const;
export async function lookupFlightStatus(code:string):Promise<FlightStatusResult> {
 if(!supabase)throw new Error('Cloud sign-in is required to check live flight status.');
 const {data,error}=await supabase.functions.invoke('aviationstack',{body:{flight_iata:code},signal:AbortSignal.timeout(20000)});
 if(error){
  let message='Unable to reach the flight-status service. Check your connection and try again.';
  const response=(error as {context?:Response}).context;
  if(response&&typeof response.clone==='function'){
   try{const body=await response.clone().json();if(typeof body.error==='string')message=body.error;}catch{/* Keep the transport error when no safe JSON body is available. */}
  }
  throw new Error(message);
 }
 if(typeof data?.error==='string')throw new Error(data.error);
 const rows=parseFlightPayload(data);
 if(!data?.fetchedAt||!Number.isFinite(Date.parse(data.fetchedAt)))throw new Error('The flight-status response has no valid fetch time.');
 return {data:rows,fetchedAt:data.fetchedAt,cached:data.cached===true};
}
