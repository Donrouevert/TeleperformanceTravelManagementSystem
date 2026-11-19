import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlightSearch } from '../features/flights/FlightSearch';
import { mapCloudFlight } from '../db/flightMapping';
import inventory from './fixtures/supabase-flights.json';
const mocks=vi.hoisted(()=>({useFlights:vi.fn(),refetch:vi.fn()}));
vi.mock('../hooks/useTravel',()=>({useFlights:mocks.useFlights}));
beforeEach(()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-15T04:00:00Z'));
 mocks.refetch.mockResolvedValue({data:inventory.map(mapCloudFlight)});
 mocks.useFlights.mockReturnValue({data:inventory.map(mapCloudFlight),isPending:false,isFetching:false,error:null,refetch:mocks.refetch});
 Element.prototype.scrollIntoView=vi.fn();
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();});
const open=()=>render(<MemoryRouter><FlightSearch/></MemoryRouter>);
const chooseTime=async(label:string,time:string)=>{fireEvent.click(screen.getByRole('button',{name:new RegExp('^'+label+':')}));const popup=await screen.findByRole('dialog');const [hour,minute]=time.split(':');fireEvent.click(within(popup).getByRole('button',{name:'hour '+hour}));fireEvent.change(within(popup).getByRole('textbox',{name:'Minute'}),{target:{value:minute}});fireEvent.click(within(popup).getByRole('button',{name:'DONE'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());};
const chooseDate=async(label:string)=>{fireEvent.click(screen.getByRole('button',{name:/^Depart:/}));const popup=await screen.findByRole('dialog');fireEvent.click(within(popup).getByRole('button',{name:label}));fireEvent.click(within(popup).getByRole('button',{name:'DONE'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());};
describe('Find a flight page with seeded Supabase inventory',()=>{
 it('defaults to a stored date and refreshes Supabase inventory',async()=>{
  open();expect(screen.getByRole('button',{name:'Depart: 02 Feb 2027'})).toBeInTheDocument();
  expect(screen.getByText(/DEMO01A/)).toBeInTheDocument();expect(screen.getByText('179 seats available')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Search flights'}));expect(mocks.refetch).toHaveBeenCalledOnce();
  expect(screen.getByRole('combobox',{name:'Sort flights'})).toHaveTextContent('Price (Low to High)');
 });
 it('uses the custom calendar and clears dates without silently restoring defaults',async()=>{
  open();await chooseDate('10 Feb 2027');expect(screen.getByRole('heading',{name:'No flights for MNL → CEB'})).toBeInTheDocument();
  const card=screen.getByRole('heading',{name:'No flights for MNL → CEB'}).closest('.card')!;
  fireEvent.click(within(card as HTMLElement).getByRole('button',{name:'Feb 2, 2027'}));expect(screen.getByText(/DEMO01A/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/^Depart:/}));const popup=await screen.findByRole('dialog');fireEvent.click(within(popup).getByRole('button',{name:'CLEAR'}));fireEvent.click(within(popup).getByRole('button',{name:'DONE'}));
  expect(screen.getByRole('button',{name:'Search flights'})).toBeDisabled();
 });
 it('filters the fare cap per traveler and shows the traveler count',()=>{
  open();fireEvent.change(screen.getByLabelText('Travelers'),{target:{value:'2'}});fireEvent.change(screen.getByRole('slider'),{target:{value:'2500'}});
  expect(screen.getByText(/DEMO01A/)).toBeInTheDocument();expect(screen.getByText('Per traveler · 2 travelers')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('slider'),{target:{value:'2000'}});expect(screen.getByText(/Schedules exist for this date/)).toBeInTheDocument();
 });
 it('evaluates round-trip time windows independently',async()=>{
  open();fireEvent.click(screen.getByRole('button',{name:'Round Trip'}));expect(screen.getByRole('button',{name:'Return: 05 Feb 2027'})).toBeInTheDocument();
  await chooseTime('Departure from','07:00');await chooseTime('Departure until','09:00');
  expect(screen.getAllByRole('button',{name:'SELECT FLIGHT'})).toHaveLength(2);await chooseTime('Return from','18:00');
  expect(screen.getByText(/DEMO01A/)).toBeInTheDocument();expect(screen.getByRole('heading',{name:'No flights for CEB → MNL'})).toBeInTheDocument();
 });
 it('keeps independent multi-city legs',()=>{
  open();fireEvent.click(screen.getByRole('button',{name:'Multi-City'}));expect(screen.getAllByRole('button',{name:/^Depart:/})).toHaveLength(2);expect(screen.getAllByRole('button',{name:'SELECT FLIGHT'})).toHaveLength(2);
 });
 it('sets destination and travel type from regional pills',()=>{
  open();fireEvent.click(screen.getByRole('button',{name:'Asia-Pacific'}));fireEvent.click(screen.getByRole('button',{name:'Singapore (SIN)'}));
  expect(screen.getByRole('combobox',{name:'To'})).toHaveTextContent('Singapore (SIN)');expect(screen.getByRole('combobox',{name:'Travel type'})).toHaveValue('International');
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
 });
 it('passes the selected route, cabin and date to the booking wizard',()=>{
  function Handoff(){const {state}=useLocation();return <pre data-testid="selection">{JSON.stringify(state.selection)}</pre>;}
  render(<MemoryRouter initialEntries={['/flights/search']}><Routes><Route path="/flights/search" element={<FlightSearch/>}/><Route path="/bookings/new" element={<Handoff/>}/></Routes></MemoryRouter>);
  fireEvent.click(screen.getByRole('button',{name:'BOOK NOW'}));const value=JSON.parse(screen.getByTestId('selection').textContent!);
  expect(value.cabin).toBe('Economy');expect(value.legs[0]).toMatchObject({origin:'MNL',destination:'CEB',date:'2027-02-02'});expect(value.flights[0].baseFare).toBeGreaterThan(0);
 });
 it('filters unavailable cabins through the new accessible menu',async()=>{
  open();fireEvent.click(screen.getByRole('combobox',{name:'Cabin Class'}));
  const business=await screen.findByRole('option',{name:'Business'});fireEvent.pointerDown(business,{pointerType:'mouse'});fireEvent.click(business);
  expect(screen.getByRole('heading',{name:'No flights for MNL → CEB'})).toBeInTheDocument();expect(screen.getByText(/Schedules exist for this date/)).toBeInTheDocument();
 });

 it('keeps the committed route until a dropdown option is selected and disables the opposite airport',async()=>{
  open();const to=screen.getByRole('combobox',{name:'To'});expect(to).toHaveTextContent('Cebu (CEB)');fireEvent.click(to);
  expect(await screen.findByRole('option',{name:'Manila (MNL)'})).toHaveAttribute('aria-disabled','true');
  expect(screen.getByText(/DEMO01A/)).toBeInTheDocument();
  const dvo=screen.getByRole('option',{name:'Davao (DVO)'});fireEvent.pointerDown(dvo,{pointerType:'mouse'});fireEvent.click(dvo);
  expect(to).toHaveTextContent('Davao (DVO)');expect(screen.queryByText(/DEMO01A/)).not.toBeInTheDocument();
 });

});
