import { describe, expect, it } from 'vitest';
import { createSeedFlights } from '../db/seed';
import { filterFlights } from '../lib/flights';
import { dayAfter } from '../lib/format';
const flights=createSeedFlights();
describe('Flight search and faceted filters',()=>{
  it('separates domestic and international routes',()=>{expect(filterFlights(flights,{travelType:'Domestic'}).every(f=>f.travelType==='Domestic')).toBe(true);expect(filterFlights(flights,{travelType:'International'}).every(f=>f.travelType==='International')).toBe(true);});
  it('filters by carrier and Eco-Choice together',()=>{const result=filterFlights(flights,{airline:'Philippine Airlines',ecoOnly:true});expect(result.length).toBeGreaterThan(0);expect(result.every(f=>f.airline==='Philippine Airlines'&&f.ecoChoice)).toBe(true);});
  it('only offers a cabin when enough seats remain',()=>{expect(filterFlights(flights,{airline:'Cebu Pacific',cabinClass:'Business'})).toHaveLength(0);expect(filterFlights(flights,{cabinClass:'Business',travelers:9})).toHaveLength(0);});
  it('applies cabin pricing and taxes to fare limits',()=>{const result=filterFlights(flights,{maxPrice:4500,cabinClass:'Economy'});expect(result.length).toBeGreaterThan(0);expect(result.every(f=>f.baseFare+f.taxesAndFees<=4500)).toBe(true);expect(filterFlights(flights,{maxPrice:4500,cabinClass:'Business'})).toHaveLength(0);});
  it('filters route, date, time and baggage',()=>{const result=filterFlights(flights,{origin:'MNL',destination:'CEB',date:dayAfter(5),timeFrom:'08:00',timeTo:'09:00',minBaggage:30});expect(result).toHaveLength(1);expect(result[0].flightNumber).toBe('PR 2845');});
  it('finds return inventory on the reverse route',()=>{expect(filterFlights(flights,{origin:'CEB',destination:'MNL',date:dayAfter(8)}).length).toBeGreaterThan(0);});
  it('excludes cancelled flights',()=>{const f={...flights[0],status:'CANCELLED' as const};expect(filterFlights([f],{})).toHaveLength(0);});
  it('sorts results by increasing fare',()=>{const result=filterFlights(flights,{});expect(result.map(f=>f.baseFare)).toEqual(result.map(f=>f.baseFare).sort((a,b)=>a-b));});
});
