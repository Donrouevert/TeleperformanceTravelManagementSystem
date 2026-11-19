import {useRef,useState,type FormEvent} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {Clock3,Plane,Search} from 'lucide-react';
import {supabase} from '../../lib/supabase';
import {flightStatusLabel,formatFlightTime,selectRelevantFlight,type FlightStatusResult} from '../../lib/aviation';
import {flightStatusQuerySettings,lookupFlightStatus} from '../../lib/flightStatusQuery';
import {isDemoCode,lookupDemoFlightStatus,normalizeStatusFlightNumber,type DemoStatusResult} from '../../lib/demoFlightStatus';
import {DemoFlightStatus} from './DemoFlightStatus';
import {useAuth} from '../../contexts/AuthContext';
import {Empty,Input,Loading} from '../../components/ui';

type StatusResult=FlightStatusResult|DemoStatusResult;
const isDemoResult=(value:StatusResult):value is DemoStatusResult=>'source' in value&&value.source==='demo';
const statusKey=(account:string,code:string)=>[isDemoCode(code)?'demo-flight-status':'aviationstack',account,code];
const lookupStatus=(code:string):Promise<StatusResult>=>isDemoCode(code)?lookupDemoFlightStatus(code):lookupFlightStatus(code);
export function FlightStatus(){
 const {user}=useAuth(),client=useQueryClient();
 const [code,setCode]=useState(''),[lookup,setLookup]=useState(''),[error,setError]=useState(''),[checking,setChecking]=useState(false),[memoryCached,setMemoryCached]=useState(false);
 const inFlight=useRef(false);
 const account=user.authId??user.employeeId;
 const query=useQuery<StatusResult>({queryKey:statusKey(account,lookup),queryFn:()=>lookupStatus(lookup),...flightStatusQuerySettings,enabled:false});
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(inFlight.current)return;
  try{
   const normalized=normalizeStatusFlightNumber(code);
   if(!supabase)throw new Error('Cloud sign-in is required to check live flight status.');
   setCode(normalized);setLookup(normalized);setError('');setChecking(true);inFlight.current=true;
   const key=statusKey(account,normalized);
   const cached=client.getQueryData<StatusResult>(key);
   const fresh=!!cached&&Date.now()-Date.parse(cached.fetchedAt)<flightStatusQuerySettings.staleTime;
   setMemoryCached(fresh);
   // Only an explicit submission reaches fetchQuery; fresh data is reused without an invoke.
   const response=fresh?cached!:await client.fetchQuery({queryKey:key,queryFn:()=>lookupStatus(normalized),...flightStatusQuerySettings,staleTime:0});
   client.setQueryData(key,response,{updatedAt:Math.min(Date.now(),Date.parse(response.fetchedAt))});
  }catch(issue){const message=issue instanceof Error?issue.message:'The flight lookup failed. Please try again.';setError(message);toast.error(message);}
  finally{inFlight.current=false;setChecking(false);}
 };
 const result=query.data;
 const demo=result&&isDemoResult(result)?result:undefined;
 const live=result&&!isDemoResult(result)?result:undefined;
 const flight=live?selectRelevantFlight(live.data,lookup):undefined;
 return <><div className="flight-status-intro"><h2>Live flight status</h2><p>Check current flight information by flight number. All times below are Philippine Standard Time.</p></div>
  <section className="card status-search"><div className="smart-panel-heading"><Plane size={18}/><b>Flights</b><span>Live status</span></div><form onSubmit={event=>void submit(event)}><Input label="Flight number" placeholder="PR2845 or DEMO01A" required value={code} onChange={event=>setCode(event.target.value)} maxLength={32}/><button className="btn btn-primary" disabled={checking||!supabase}><Search size={16}/>{checking?'Checking…':'Check status'}</button></form><div className="subtle-banner">Lookups run only when you submit. Results, including empty results, are cached for 15 minutes. Use a demo code such as DEMO01A to check a saved schedule. Demo lookups do not use live airline data.</div></section>
  {!supabase?<div className="card"><Empty title="Cloud sign-in required" description="Configure the Supabase URL and publishable key to use the protected flight-status service."/></div>
   :error?<div role="alert" className="validation-errors">{error}</div>
   :checking?<Loading layout="status" label={`Checking ${lookup}`}/>
   :demo?<DemoFlightStatus result={demo} code={lookup} cached={memoryCached||demo.cached}/>:live?<><p className="status-timestamp"><Clock3 size={14}/> Last fetched {formatFlightTime(live.fetchedAt)} · {memoryCached||live.cached?'Cached response':'Provider response'} · 15-minute cache</p>
    {!flight?<div className="card"><Empty title={`No live status found for ${lookup}`} description="The provider has not reported a matching current-day flight. Confirm the flight number and try again later. For a demo schedule, enter its DEMO flight code."/></div>
     :<article className="card live-flight"><div className="smart-panel-heading"><Plane size={18}/><b>{flight.flight.iata}</b><span>{flight.airline.name||'Airline not reported'}</span><strong className={`provider-status provider-${flight.flight_status}`}>{flightStatusLabel(flight)}</strong></div><div className="live-route">{[flight.departure,flight.arrival].map((airport,index)=><section key={index}><small>{index?'ARRIVAL':'DEPARTURE'}</small><h2><Plane size={22}/>{airport.iata||'Not reported'}</h2><p>{airport.airport||'Airport name not reported'}</p><dl><dt>Scheduled</dt><dd>{formatFlightTime(airport.scheduled)}</dd><dt>Estimated</dt><dd>{formatFlightTime(airport.estimated)}</dd><dt>Actual</dt><dd>{formatFlightTime(airport.actual)}</dd><dt>Terminal</dt><dd>{airport.terminal||'Not reported'}</dd><dt>Gate</dt><dd>{airport.gate||'Not reported'}</dd><dt>Delay</dt><dd>{airport.delay===undefined?'Not reported':`${airport.delay} min`}</dd></dl></section>)}</div><p className="status-result-note">Showing the active or nearest current-day flight. Times are PHT (UTC+8); this is provider-reported status, not a guaranteed live aircraft position.</p></article>}</>
   :<div className="card"><Empty title="Follow your flight" description="Enter a real flight number or a demo code such as DEMO01A, then choose Check status. No request is made when this page opens."/></div>}
 </>;
}
