import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FlightDateRangePicker } from '../features/flights/FlightDateRangePicker';
import { FlightDirectory, seenLabel } from '../features/flights/FlightDirectory';
import { mapCloudFlight } from '../db/flightMapping';
import inventory from './fixtures/supabase-flights.json';
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-15T04:00:00Z'));});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('commits a range only on Done and advances from depart to return',async()=>{
 const change=vi.fn();render(<FlightDateRangePicker departure="2026-11-23" returnDate="2026-11-30" range onChange={change}/>);
 fireEvent.click(screen.getByRole('button',{name:'Depart: 23 Nov 2026'}));const popup=await screen.findByRole('dialog');
 expect(within(popup).getByRole('button',{name:'14 Nov 2026'})).toBeDisabled();
 fireEvent.click(within(popup).getByRole('button',{name:'24 Nov 2026'}));expect(change).not.toHaveBeenCalled();expect(screen.getByText('Select return date')).toBeInTheDocument();
 fireEvent.click(within(popup).getByRole('button',{name:'02 Dec 2026'}));fireEvent.click(within(popup).getByRole('button',{name:'DONE'}));expect(change).toHaveBeenCalledWith('2026-11-24','2026-12-02');
});
it('prevents an incomplete range and restarts when return precedes departure',async()=>{
 const change=vi.fn();render(<FlightDateRangePicker departure="2026-11-23" returnDate="" range onChange={change}/>);fireEvent.click(screen.getByRole('button',{name:'Return: Choose date'}));const popup=await screen.findByRole('dialog');
 fireEvent.click(within(popup).getByRole('button',{name:'20 Nov 2026'}));expect(within(popup).getByRole('button',{name:'DONE'})).toBeDisabled();
 fireEvent.click(within(popup).getByRole('button',{name:'25 Nov 2026'}));fireEvent.click(within(popup).getByRole('button',{name:'DONE'}));expect(change).toHaveBeenCalledWith('2026-11-20','2026-11-25');
});
it('paginates six rows at a time and labels missing fare observation dates honestly',()=>{
 const flights=Array.from({length:14},(_,i)=>({...mapCloudFlight(inventory[0]),id:'flight-'+i}));
 render(<FlightDirectory flights={flights} cabin="Economy" tripType="One-Way" travelers={1} valid onSelect={vi.fn()}/>);
 expect(screen.getAllByRole('button',{name:'BOOK NOW'})).toHaveLength(6);fireEvent.click(screen.getByRole('button',{name:'VIEW MORE'}));expect(screen.getAllByRole('button',{name:'BOOK NOW'})).toHaveLength(12);fireEvent.click(screen.getByRole('button',{name:'VIEW MORE'}));expect(screen.getAllByRole('button',{name:'BOOK NOW'})).toHaveLength(14);expect(screen.queryByRole('button',{name:'VIEW MORE'})).not.toBeInTheDocument();
 expect(seenLabel()).toBe('Seen: not recorded');expect(seenLabel('2026-11-14T04:00:00Z')).toBe('Seen: 1 day ago');
});
