import { Clock3, Plane } from 'lucide-react';
import { Empty } from '../../components/ui';
import { airports } from '../../types/travel';
import { formatFlightTime } from '../../lib/aviation';
import type { DemoStatusResult } from '../../lib/demoFlightStatus';
import './demo-flight-status.css';
export function DemoFlightStatus({result,code,cached}:{result:DemoStatusResult;code:string;cached:boolean}) {
 const flight=result.schedule;
 const status=flight?({SCHEDULED:'Scheduled',DELAYED:'Delayed',CANCELLED:'Cancelled'}[flight.status]??'Not reported'):'';
 return <section aria-label="Demo flight schedule">
  <p className="status-timestamp"><Clock3 size={14}/> Schedule checked {formatFlightTime(result.fetchedAt)} · {cached?'Cached demo schedule':'Demo schedule'} · 15-minute cache</p>
  {!flight?<div className="card"><Empty title={`No demo schedule found for ${code}`} description="Choose a demo flight from Find flights, or ask your TMC to add its schedule."/></div>
   :<article className="card demo-status-card"><div className="smart-panel-heading"><Plane size={18}/><b>{flight.flightNumber}</b><span>{flight.airline}</span><strong className="demo-status-badge">Demo flight · {status}</strong></div>
    <div className="demo-data-note"><b>Demonstration data</b><p>This status comes from your saved demo schedule. It is not a live airline update.</p></div>
    <div className="live-route">{[{code:flight.origin,time:flight.departureTimestamp},{code:flight.destination,time:flight.arrivalTimestamp}].map((airport,index)=><section key={index}><small>{index?'ARRIVAL':'DEPARTURE'}</small><h2><Plane size={22}/>{airport.code}</h2><p>{airports[airport.code]||airport.code}</p><dl><dt>Scheduled</dt><dd>{formatFlightTime(airport.time)}</dd></dl></section>)}</div>
    <p className="status-result-note">Showing the current, next available, or latest saved demo schedule. Status is stored as {status.toLowerCase()}; no aircraft position, actual arrival, terminal, gate or delay duration is inferred.</p>
   </article>}
 </section>;
}
