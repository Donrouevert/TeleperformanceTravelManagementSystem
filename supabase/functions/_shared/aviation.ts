export const STATUS_CACHE_MS=15*60*1000;
export interface FlightAirport {iata:string;airport:string;scheduled?:string;estimated?:string;actual?:string;gate?:string;terminal?:string;delay?:number;}
export interface LiveFlight {flight_date:string;flight_status:string;airline:{name:string};flight:{iata:string;number:string};departure:FlightAirport;arrival:FlightAirport;}
export interface FlightStatusResult {data:LiveFlight[];fetchedAt:string;cached:boolean;}
export function normalizeFlightNumber(value:string):string {
 const code=value.trim().toUpperCase().replace(/[\s-]/g,'');
 if(!/^(?=[A-Z0-9]{2}\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(code))throw new Error('Use an IATA flight number such as PR2845 or 5J563.');
 return code;
}
export function providerErrorMessage(value:unknown):string {
 const error=typeof value==='object'&&value!==null?value as Record<string,unknown>:{};
 const code=[error.code,error.type].filter(value=>value!==undefined).join(' ').toLowerCase();
 if(/invalid_access_key|missing_access_key|invalid_api_key|inactive_user/.test(code))return 'The flight data service key is invalid or inactive. Ask your administrator to update it.';
 if(/usage_limit|quota|monthly/.test(code))return 'The flight data service monthly quota has been reached. Try again after it resets.';
 if(/rate_limit|too_many/.test(code))return 'The flight data service is rate limited. Please try again later.';
 if(/https_access|function_access|plan|subscription|restricted/.test(code))return 'This lookup is not available on the configured flight data plan. Ask your administrator to check the provider settings.';
 return 'The flight data service rejected the lookup. Please try again later or contact your administrator.';
}
function text(value:unknown):string {return typeof value==='string'?value:'';}
function timestamp(value:unknown):string|undefined {
 const string=text(value);
 return /(?:Z|[+-]\d\d:\d\d)$/i.test(string)&&Number.isFinite(Date.parse(string))?string:undefined;
}
function airport(value:unknown):FlightAirport {
 const row=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
 const delay=row.delay==null?NaN:Number(row.delay);
 return {iata:text(row.iata).toUpperCase(),airport:text(row.airport),scheduled:timestamp(row.scheduled),estimated:timestamp(row.estimated),actual:timestamp(row.actual),gate:text(row.gate)||undefined,terminal:text(row.terminal)||undefined,delay:Number.isFinite(delay)&&delay>=0?delay:undefined};
}
/** Pick safe fields and reject HTTP-200 error envelopes or malformed results. */
export function parseFlightPayload(value:unknown):LiveFlight[] {
 const payload=value as Record<string,unknown>|null;
 if(!payload||typeof payload!=='object')throw new Error('The flight data service returned an invalid response.');
 if(payload.error)throw new Error(providerErrorMessage(payload.error));
 if(!Array.isArray(payload.data))throw new Error('The flight data service returned an invalid response.');
 return payload.data.filter(row=>row&&typeof row==='object').map(row=>({flight_date:text(row.flight_date),flight_status:text(row.flight_status).toLowerCase(),airline:{name:text(row.airline?.name)},flight:{iata:text(row.flight?.iata).toUpperCase(),number:text(row.flight?.number)},departure:airport(row.departure),arrival:airport(row.arrival)}));
}
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormatter=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function philippineDay(instant:number):string {
 const parts=Object.fromEntries(dayFormatter.formatToParts(instant).map(part=>[part.type,part.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export function formatFlightTime(value?:string):string {
 return value&&timestamp(value)?`${timeFormatter.format(new Date(value))} PHT`:'Not reported';
}
export function selectRelevantFlight(rows:LiveFlight[],code:string,now=Date.now()):LiveFlight|undefined {
 const today=philippineDay(now);
 const candidates=rows.filter(row=>{
  try{if(normalizeFlightNumber(row.flight.iata)!==code)return false;}catch{return false;}
  const departure=Date.parse(row.departure.scheduled??row.departure.estimated??row.departure.actual??'');
  const arrival=Date.parse(row.arrival.estimated??row.arrival.scheduled??row.arrival.actual??'');
  const overnight=row.flight_status==='active'&&departure<=now&&departure>now-36*3600000&&arrival>=now-3600000;
  return overnight||(Number.isFinite(departure)?philippineDay(departure)===today:row.flight_date===today);
 });
 return candidates.sort((a,b)=>{
  const active=Number(b.flight_status==='active')-Number(a.flight_status==='active');if(active)return active;
  const proximity=(row:LiveFlight)=>Math.abs(Date.parse(row.departure.estimated??row.departure.scheduled??row.departure.actual??'')-now);
  const aDistance=proximity(a),bDistance=proximity(b);
  return (Number.isFinite(aDistance)?aDistance:Infinity)-(Number.isFinite(bDistance)?bDistance:Infinity);
 })[0];
}
export function flightStatusLabel(flight:LiveFlight):string {
 if(flight.flight_status==='scheduled'&&Math.max(flight.departure.delay??0,flight.arrival.delay??0)>0)return 'Delayed';
 return ({scheduled:'Scheduled',active:'Active / En Route',landed:'Landed',delayed:'Delayed',cancelled:'Cancelled',diverted:'Diverted'} as Record<string,string>)[flight.flight_status]??'Not reported';
}
