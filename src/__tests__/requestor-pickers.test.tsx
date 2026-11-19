import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BookingWizard } from '../features/bookings/BookingWizard';
import { demoUsers } from '../db/seed';
const mocks=vi.hoisted(()=>({mutate:vi.fn()}));
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:demoUsers[0]})}));
vi.mock('../hooks/useTravel',()=>({useTravelMutation:()=>({isPending:false,mutate:mocks.mutate})}));
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-15T04:00:00Z'));});
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();});
function next(){fireEvent.click(screen.getByRole('button',{name:'Continue'}));}
function openTrip(){const view=render(<MemoryRouter><BookingWizard/></MemoryRouter>);next();expect(screen.getByRole('heading',{name:'Trip details'})).toBeInTheDocument();return view;}
async function closeDone(popup:HTMLElement){fireEvent.click(within(popup).getByRole('button',{name:'DONE'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());}
async function calendar(label:string){fireEvent.click(screen.getByRole('button',{name:new RegExp('^'+label+':')}));return screen.findByRole('dialog');}
async function clock(label:'departure'|'return'){fireEvent.click(screen.getByRole('button',{name:new RegExp('^Preferred '+label+' time')}));return screen.findByRole('dialog');}
async function finish(){next();next();next();fireEvent.change(screen.getByRole('textbox',{name:'Business justification'}),{target:{value:'Attend a regional business planning workshop.'}});fireEvent.click(screen.getByRole('button',{name:'Submit travel request'}));expect(mocks.mutate).toHaveBeenCalledOnce();return mocks.mutate.mock.calls[0][0];}
it('uses the shared two-month calendar and analog PHT clock, committing dates/times to the request',async()=>{
 const {container}=openTrip();expect(container.querySelector('input[type="date"],input[type="time"]')).toBeNull();
 let popup=await calendar('Departure date');expect(within(popup).getByRole('button',{name:'14 Nov 2026'})).toBeDisabled();expect(within(popup).getByRole('region',{name:'December 2026'})).toBeInTheDocument();fireEvent.click(within(popup).getByRole('button',{name:'25 Nov 2026'}));await closeDone(popup);
 popup=await clock('departure');expect(within(popup).getByRole('slider',{name:'Hour dial'})).toBeInTheDocument();expect(within(popup).queryByRole('button',{name:/Until/})).toBeNull();fireEvent.click(within(popup).getByRole('button',{name:'hour 17'}));fireEvent.change(within(popup).getByRole('textbox',{name:'Minute'}),{target:{value:'37'}});await closeDone(popup);
 const request=await finish();expect(request.tripDetails.departureDate).toBe('2026-11-25');expect(request.tripDetails.preferredDepartureTime).toBe('17:37');expect(request.tripDetails.itineraryLegs[0].date).toBe('2026-11-25');
});
it('limits return dates to departure or later and keeps return preferences independent',async()=>{
 openTrip();fireEvent.change(screen.getByRole('combobox',{name:'Trip type'}),{target:{value:'Round Trip'}});
 let popup=await calendar('Return date');expect(within(popup).getByRole('button',{name:'19 Nov 2026'})).toBeDisabled();fireEvent.click(within(popup).getByRole('button',{name:'24 Nov 2026'}));await closeDone(popup);
 popup=await clock('return');fireEvent.click(within(popup).getByRole('button',{name:'hour 22'}));fireEvent.click(within(popup).getByRole('button',{name:'minute 15'}));await closeDone(popup);
 const request=await finish();expect(request.tripDetails.preferredDepartureTime).toBe('08:00');expect(request.tripDetails.preferredReturnTime).toBe('22:15');expect(request.tripDetails.returnDate).toBe('2026-11-24');expect(request.tripDetails.itineraryLegs[1].date).toBe('2026-11-24');
});
it('retains required time validation after Clear and rejects invalid HH:mm input',async()=>{
 openTrip();let popup=await clock('departure');fireEvent.click(within(popup).getByRole('button',{name:'CLEAR'}));await closeDone(popup);next();expect(screen.getByRole('alert')).toHaveTextContent('preferred time');expect(screen.getByRole('heading',{name:'Trip details'})).toBeInTheDocument();
 popup=await clock('departure');fireEvent.change(within(popup).getByRole('textbox',{name:'Hour'}),{target:{value:'24'}});expect(within(popup).getByRole('button',{name:'DONE'})).toBeDisabled();fireEvent.change(within(popup).getByRole('textbox',{name:'Hour'}),{target:{value:'00'}});fireEvent.change(within(popup).getByRole('textbox',{name:'Minute'}),{target:{value:'00'}});await closeDone(popup);next();expect(screen.getByRole('heading',{name:'Flight requirements'})).toBeInTheDocument();
});
it('synchronizes the first multi-city date and enforces the previous leg as the next date minimum',async()=>{
 openTrip();fireEvent.change(screen.getByRole('combobox',{name:'Trip type'}),{target:{value:'Multi-City'}});
 let popup=await calendar('Date · leg 1');fireEvent.click(within(popup).getByRole('button',{name:'21 Nov 2026'}));await closeDone(popup);expect(screen.getByRole('button',{name:'Departure date: 21 Nov 2026'})).toBeInTheDocument();
 popup=await calendar('Date · leg 2');expect(within(popup).getByRole('button',{name:'20 Nov 2026'})).toBeDisabled();fireEvent.click(within(popup).getByRole('button',{name:'24 Nov 2026'}));await closeDone(popup);
 const request=await finish();expect(request.tripDetails.itineraryLegs.map((leg:{date:string})=>leg.date)).toEqual(['2026-11-21','2026-11-24']);expect(request.tripDetails.departureDate).toBe('2026-11-21');
});
it('keeps a cleared required date empty until it is explicitly selected again',async()=>{
 openTrip();const popup=await calendar('Departure date');fireEvent.click(within(popup).getByRole('button',{name:'CLEAR'}));await closeDone(popup);next();expect(screen.getByRole('button',{name:'Departure date: Choose date'})).toBeInTheDocument();expect(screen.getByRole('alert')).toHaveTextContent('future dates');expect(mocks.mutate).not.toHaveBeenCalled();
});
