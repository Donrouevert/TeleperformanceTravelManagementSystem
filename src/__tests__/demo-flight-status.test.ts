import { expect, it } from 'vitest';
import { normalizeStatusFlightNumber, selectDemoSchedule, type DemoFlight } from '../lib/demoFlightStatus';
const flight=(departure:string,status:DemoFlight['status']='SCHEDULED'):DemoFlight=>({id:departure,airline:'Demo Airline',flightNumber:'DEMO01A',origin:'MNL',destination:'CEB',departureTimestamp:departure,arrivalTimestamp:new Date(Date.parse(departure)+90*60000).toISOString(),status});
it('accepts demo codes independently of the strict live IATA validator',()=>{
 expect(normalizeStatusFlightNumber(' demo -01 a ')).toBe('DEMO01A');expect(normalizeStatusFlightNumber('pr-2845')).toBe('PR2845');expect(()=>normalizeStatusFlightNumber('DEMO!01A')).toThrow('IATA flight number');expect(()=>normalizeStatusFlightNumber('DEMO123456A')).toThrow();
});
it('selects the next future demo date and the latest past date when no current interval exists',()=>{
 const now=Date.parse('2026-11-17T00:00:00Z');const past=flight('2026-11-16T00:00:00Z'),next=flight('2027-02-02T00:00:00Z'),later=flight('2027-02-04T00:00:00Z');expect(selectDemoSchedule([later,past,next],now)).toBe(next);expect(selectDemoSchedule([flight('2026-11-14T00:00:00Z'),past],now)).toBe(past);
});
it('prioritizes a current interval while retaining its recorded status',()=>{
 const now=Date.parse('2026-11-17T00:30:00Z'),current=flight('2026-11-17T00:00:00Z','CANCELLED');expect(selectDemoSchedule([flight('2026-11-18T00:00:00Z'),current],now)).toBe(current);expect(current.status).toBe('CANCELLED');expect(selectDemoSchedule([],now)).toBeNull();
});
