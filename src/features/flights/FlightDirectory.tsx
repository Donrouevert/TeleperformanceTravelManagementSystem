import { useState } from 'react';
import { EcoBadge } from '../../components/ui';
import { airports, type CabinClass, type FlightSchedule } from '../../types/travel';
import { farePerTraveler, manilaDateTime, seatsForCabin } from '../../lib/flights';
import { calendarDateLabel } from './FlightDateRangePicker';
import { timeLabel } from '../../lib/format';
export function seenLabel(timestamp?:string,now=Date.now()) {
 if(!timestamp||!Number.isFinite(Date.parse(timestamp)))return 'Seen: not recorded';
 const mins=Math.max(0,Math.floor((now-Date.parse(timestamp))/60000));
 return `Seen: ${mins<60?(mins<1?'just now':`${mins} min ago`):mins<1440?`${Math.floor(mins/60)} hrs ago`:`${Math.floor(mins/1440)} day${Math.floor(mins/1440)===1?'':'s'} ago`}`;
}
export function FlightDirectory({flights,cabin,tripType,travelers,selected,valid,onSelect,bookingEnabled=true}:{flights:FlightSchedule[];cabin:CabinClass;tripType:string;travelers:number;selected?:string;valid:boolean;bookingEnabled?:boolean;onSelect:(flight:FlightSchedule)=>void}) {
 const [visible,setVisible]=useState(6);
 return <div className="flight-directory"><div className="fare-table-scroll"><table className="fare-table"><caption className="sr-only">Available flights and fares per traveler</caption><thead><tr>{['From','To','Fare Type','Departure','Price',''].map((s,i)=><th key={i} scope="col">{s||<span className="sr-only">Action</span>}</th>)}</tr></thead><tbody>{flights.slice(0,visible).map(f=><tr key={f.id} className={selected===f.id?'is-selected':''}><td data-label="From"><b>{airports[f.origin]||f.origin} ({f.origin})</b><small>{f.airline} · {f.flightNumber}</small></td><td data-label="To"><b>{airports[f.destination]||f.destination} ({f.destination})</b><small>{seatsForCabin(f,cabin)} seats available</small></td><td data-label="Fare Type">{tripType} / {cabin}{f.ecoChoice&&<EcoBadge/>}<small>{f.co2Kg} kg CO₂ / traveler</small></td><td data-label="Departure">Depart: {calendarDateLabel(manilaDateTime(f.departureTimestamp)!.date)}<small>{timeLabel(f.departureTimestamp)} PHT · {f.status==='DELAYED'?'Delayed':'Scheduled'}</small></td><td data-label="Price"><small>From</small><strong className="fare-value">PHP {new Intl.NumberFormat('en-PH',{maximumFractionDigits:2}).format(farePerTraveler(f,cabin))}*</strong><small>{seenLabel(f.fareSeenAt)}</small>{travelers>1&&<small>Per traveler · {travelers} travelers</small>}</td><td>{bookingEnabled?<button type="button" className="btn fare-book" disabled={!valid} onClick={()=>onSelect(f)}>{tripType==='One-Way'?'BOOK NOW':selected===f.id?'SELECTED':'SELECT FLIGHT'}</button>:<span className="muted">Reference fare</span>}</td></tr>)}</tbody></table></div>{visible<flights.length&&<div className="fare-more"><button type="button" className="btn" onClick={()=>setVisible(v=>v+6)}>VIEW MORE</button><small>{Math.min(visible,flights.length)} of {flights.length} flights</small></div>}</div>;
}
