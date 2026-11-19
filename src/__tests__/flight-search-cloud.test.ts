import { beforeEach, describe, expect, it, vi } from 'vitest';
import inventory from './fixtures/supabase-flights.json';
import { CloudRepository } from '../db/cloudRepository';
import { mapCloudFlight } from '../db/flightMapping';
import { availableFlightDates, fareForTravelers, farePerTraveler, filterFlights, manilaDateTime, normalizeIata } from '../lib/flights';
import type { FlightSchedule } from '../types/travel';
const mocks=vi.hoisted(()=>({from:vi.fn(),select:vi.fn()}));
vi.mock('../lib/supabase',()=>({supabase:{from:mocks.from}}));
const flights=inventory.map(mapCloudFlight);
const base=flights.find(f=>f.flightNumber==='DEMO01A')!;
const flight=(id:string,patch:Partial<FlightSchedule>={}):FlightSchedule=>({...base,id,flightNumber:id,...patch});
beforeEach(()=>{vi.clearAllMocks();mocks.from.mockReturnValue({select:mocks.select});mocks.select.mockResolvedValue({data:inventory,error:null});});
describe('Supabase flight search pipeline',()=>{
 it('reads the actual schedules/cabins relation and propagates backend errors',async()=>{
  const rows=await new CloudRepository().listFlights();
  expect(mocks.from).toHaveBeenCalledWith('flight_schedules');expect(mocks.select).toHaveBeenCalledWith('*,flight_cabins(*)');expect(rows).toHaveLength(20);
  mocks.select.mockResolvedValue({data:null,error:{message:'permission denied'}});await expect(new CloudRepository().listFlights()).rejects.toThrow('permission denied');
 });
 it('finds the real seeded MNL–CEB row on its actual Philippine date',async()=>{
  const rows=await new CloudRepository().listFlights();
  const result=filterFlights(rows,{origin:'MNL · Manila',destination:'CEB · Cebu',date:'2027-02-02',cabinClass:'economy',travelers:1,timeFrom:'',timeTo:''});
  expect(result.map(f=>f.flightNumber)).toEqual(['DEMO01A']);expect(result[0].seats.Economy).toBe(179);expect(farePerTraveler(result[0])).toBe(2457);
  expect(filterFlights(rows,{origin:'MNL',destination:'CEB',date:'2026-11-20'})).toEqual([]);
  expect(availableFlightDates(rows,{origin:'MNL',destination:'CEB'})).toEqual(['2027-02-02','2027-02-03','2027-02-04','2027-02-14']);
 });
 it('matches cabin names without case or formatting sensitivity and keeps missing cabins unavailable',()=>{
  const row={...inventory[0],flight_cabins:[{cabin_class:' eCoNoMy ',available_seats:'2',capacity:'180'},{cabin_class:'premium_economy',available_seats:'1',capacity:'10'}]};
  const mapped=mapCloudFlight(row);expect(mapped.seats).toEqual({Economy:2,'Premium Economy':1,Business:0});
  expect(filterFlights([mapped],{cabinClass:'ECONOMY',travelers:2})).toHaveLength(1);expect(filterFlights([mapped],{travelers:3})).toHaveLength(0);expect(filterFlights([mapped],{cabinClass:'Business'})).toHaveLength(0);
 });
 it('uses Manila midnight for a raw UTC early-morning flight',()=>{
  const early=flight('EARLY',{departureTimestamp:'2027-02-01T16:30:00Z',arrivalTimestamp:'2027-02-01T18:00:00Z'});
  expect(manilaDateTime(early.departureTimestamp)?.date).toBe('2027-02-02');
  expect(filterFlights([early],{date:'2027-02-02',timeFrom:'00:00',timeTo:'01:00'})).toHaveLength(1);
  expect(filterFlights([early],{date:'2027-02-01'})).toHaveLength(0);
  expect(manilaDateTime('2027-02-02T00:30:00+09:00')?.date).toBe('2027-02-01');
 });
 it.each([['',''],['   ',''],['','09:00'],['08:00','']])('does not exclude results for optional time bounds %j / %j',(timeFrom,timeTo)=>{expect(filterFlights([base],{timeFrom,timeTo})).toHaveLength(1);});
 it('uses taxes and cabin pricing for the per-traveler limit, not the group total',()=>{
  const f=flight('FARE',{baseFare:2000,taxesAndFees:500});
  expect(filterFlights([f],{maxFarePerTraveler:2500,travelers:2})).toHaveLength(1);
  expect(filterFlights([f],{maxFarePerTraveler:2499})).toHaveLength(0);
  expect(farePerTraveler(f,'BUSINESS')).toBe(6100);expect(filterFlights([{...f,seats:{...f.seats,Business:2}}],{cabinClass:'Business',maxFarePerTraveler:6099})).toHaveLength(0);
 });
 it('sorts by all-in fare rather than base fare',()=>{
  const expensive=flight('LOW-BASE',{baseFare:1000,taxesAndFees:3000});const cheaper=flight('LOW-TOTAL',{baseFare:2500,taxesAndFees:100});
  expect(filterFlights([expensive,cheaper],{sortBy:'lowest_fare'}).map(f=>f.id)).toEqual(['LOW-TOTAL','LOW-BASE']);
 });
 it('rounds group fares at the same stage as server ticketing',()=>{
  const f=flight('ROUNDING',{baseFare:100.01,taxesAndFees:50});
  expect(farePerTraveler(f,'Premium Economy')).toBe(215.02);
  expect(fareForTravelers(f,'Premium Economy',3)).toBe(645.05);
 });
 it('sorts by departure instant across UTC offsets, duration and emissions',()=>{
  const a=flight('A',{departureTimestamp:'2027-02-02T02:00:00Z',arrivalTimestamp:'2027-02-02T03:00:00Z',co2Kg:70});
  const b=flight('B',{departureTimestamp:'2027-02-02T09:00:00+08:00',arrivalTimestamp:'2027-02-02T11:00:00+08:00',co2Kg:40});
  expect(filterFlights([a,b],{sortBy:'earliest_departure'}).map(f=>f.id)).toEqual(['B','A']);
  expect(filterFlights([b,a],{sortBy:'shortest_duration'}).map(f=>f.id)).toEqual(['A','B']);
  expect(filterFlights([a,b],{sortBy:'lowest_co2'}).map(f=>f.id)).toEqual(['B','A']);
 });
 it('normalizes input labels, rejects invalid times and never mutates the source list',()=>{
  expect(normalizeIata(' mnl · Manila ')).toBe('MNL');const input=[base];filterFlights(input,{});expect(input).toEqual([base]);
  expect(filterFlights(input,{timeFrom:'25:00'})).toEqual([]);expect(filterFlights(input,{origin:'not an airport'})).toEqual([]);
 });
});
