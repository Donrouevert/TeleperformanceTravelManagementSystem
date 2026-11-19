import { supabase } from './supabase';
import { normalizeFlightNumber } from './aviation';

export interface DemoFlight {
 id:string; airline:string; flightNumber:string; origin:string; destination:string;
 departureTimestamp:string; arrivalTimestamp:string; status:'SCHEDULED'|'DELAYED'|'CANCELLED';
}
export interface DemoStatusResult {source:'demo';schedule:DemoFlight|null;fetchedAt:string;cached:boolean;}
export const isDemoCode=(code:string)=>/^DEMO\d{2,4}[A-Z]?$/.test(code);
export function normalizeStatusFlightNumber(value:string):string {
 const code=value.trim().toUpperCase().replace(/[\s-]/g,'');
 if(isDemoCode(code))return code;
 try{return normalizeFlightNumber(value);}catch{throw new Error('Use an IATA flight number such as PR2845 or a demo code such as DEMO01A.');}
}
/** Future demo dates are intentional; select the current interval, next schedule, then latest past schedule. */
export function selectDemoSchedule(rows:DemoFlight[],now=Date.now()):DemoFlight|null {
 const valid=rows.filter(row=>Number.isFinite(Date.parse(row.departureTimestamp))&&Date.parse(row.arrivalTimestamp)>Date.parse(row.departureTimestamp));
 const current=valid.filter(row=>Date.parse(row.departureTimestamp)<=now&&Date.parse(row.arrivalTimestamp)>=now).sort((a,b)=>Date.parse(b.departureTimestamp)-Date.parse(a.departureTimestamp));
 const upcoming=valid.filter(row=>Date.parse(row.departureTimestamp)>now).sort((a,b)=>Date.parse(a.departureTimestamp)-Date.parse(b.departureTimestamp));
 const past=valid.filter(row=>Date.parse(row.arrivalTimestamp)<now).sort((a,b)=>Date.parse(b.departureTimestamp)-Date.parse(a.departureTimestamp));
 return current[0]??upcoming[0]??past[0]??null;
}
export async function lookupDemoFlightStatus(code:string):Promise<DemoStatusResult> {
 if(!supabase)throw new Error('Cloud sign-in is required to check demo flight schedules.');
 if(!isDemoCode(code))throw new Error('Enter a demo flight code such as DEMO01A.');
 const {data,error}=await supabase.from('flight_schedules')
  .select('id,airline,flight_number,origin,destination,departure_timestamp,arrival_timestamp,status')
  .eq('flight_number',code).order('departure_timestamp',{ascending:true}).limit(100);
 if(error)throw new Error('Unable to read demo flight schedules. Check your connection and try again.');
 const rows:DemoFlight[]=(data??[]).filter(row=>row.flight_number===code).map(row=>({id:row.id,airline:row.airline,flightNumber:row.flight_number,origin:row.origin,destination:row.destination,departureTimestamp:row.departure_timestamp,arrivalTimestamp:row.arrival_timestamp,status:row.status as DemoFlight['status']}));
 const schedule=selectDemoSchedule(rows);
 if(rows.length&&!schedule)throw new Error('This demo flight has invalid schedule times. Ask your TMC to update its schedule.');
 return {source:'demo',schedule,fetchedAt:new Date().toISOString(),cached:false};
}
