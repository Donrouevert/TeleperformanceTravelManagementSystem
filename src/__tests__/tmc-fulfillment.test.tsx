import {cleanup,fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TicketPanel} from '../features/bookings/RequestDetail';
import {createSeedFlights,demoUsers,makeDraft} from '../db/seed';
import {php} from '../lib/format';
const mocks=vi.hoisted(()=>({useFlights:vi.fn(),issue:vi.fn(),quote:vi.fn(),saveFlight:vi.fn(),refetch:vi.fn()}));
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:demoUsers[2],cloud:true})}));
vi.mock('../db/repositories',()=>({repository:{issue:mocks.issue,quote:mocks.quote,saveFlight:mocks.saveFlight}}));
vi.mock('../hooks/useTravel',()=>({useFlights:mocks.useFlights,useTravelMutation:(fn:()=>Promise<unknown>)=>({mutate:(input?:unknown,options?:{onSuccess?:(result:any)=>void})=>void Promise.resolve((fn as (input?:unknown)=>Promise<unknown>)(input)).then(result=>options?.onSuccess?.(result)),isPending:false,error:null})}));
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-15T04:00:00Z'));mocks.issue.mockResolvedValue({});mocks.quote.mockResolvedValue({});mocks.saveFlight.mockImplementation(async f=>f);mocks.useFlights.mockReturnValue({data:createSeedFlights(),isPending:false,error:null,refetch:mocks.refetch});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();});
function setup({roundtrip=false,excess=0,authorized=false}={}){const r=makeDraft();r.status='APPROVED_FOR_TMC';r.approvedBudgetPhp=150000;r.approval.approvedBySignature='Manager';r.approval.excessBaggageAuthorized=authorized;r.flightRequirements.excessBaggageKg=excess;if(roundtrip){r.tripDetails.tripType='Round Trip';r.tripDetails.itineraryLegs.push({origin:'CEB',destination:'MNL',date:'2026-11-23'});}render(<MemoryRouter><TicketPanel request={r}/></MemoryRouter>);return r;}
function selectFlights(roundtrip=false){fireEvent.change(screen.getByRole('combobox',{name:/^Flight 1/}),{target:{value:'FLT-1'}});if(roundtrip)fireEvent.change(screen.getByRole('combobox',{name:/^Flight 2/}),{target:{value:'FLT-1-R'}});}
function amount(label:string,value:string){fireEvent.change(screen.getByRole('spinbutton',{name:label}),{target:{value}});}
it('allows cloud TMC quote/reference entry and submits all-traveler/leg totals',()=>{
 const r=setup({roundtrip:true,excess:5});selectFlights(true);expect(screen.getByRole('spinbutton',{name:'Base fare'})).toBeEnabled();expect(screen.getByRole('textbox',{name:/^PNR/})).toBeEnabled();
 amount('Base fare','8000');amount('Taxes & fees','1500.25');amount('Excess baggage fee','200.25');fireEvent.change(screen.getByRole('textbox',{name:'TMC consultant'}),{target:{value:'Daniel'}});fireEvent.change(screen.getByRole('textbox',{name:/^PNR/}),{target:{value:'abc123'}});fireEvent.change(screen.getByRole('textbox',{name:/^Ticket number/}),{target:{value:'079-123456'}});
 expect(screen.getByText(php(9700.5))).toBeInTheDocument();expect(screen.getByText(php(200.25))).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Assign & issue ticket'}));expect(mocks.issue).toHaveBeenCalledWith(r.id,demoUsers[2],['FLT-1','FLT-1-R'],expect.objectContaining({baseFare:8000,taxesAndFees:1500.25,baggageFee:200.25,bookingReferencePnr:'ABC123',ticketNumber:'079-123456',tmcTravelConsultant:'Daniel'}));
});
it('requires every leg while allowing explicit zero fares and blank automatic references',()=>{
 setup({roundtrip:true});selectFlights();const submit=screen.getByRole('button',{name:'Assign & issue ticket'});expect(submit).toBeDisabled();selectFlights(true);amount('Base fare','0');amount('Taxes & fees','0');expect(submit).toBeEnabled();fireEvent.click(submit);expect(mocks.issue.mock.calls[0][3]).toMatchObject({baseFare:0,taxesAndFees:0,bookingReferencePnr:'',ticketNumber:''});expect(mocks.issue.mock.calls[0][3].baggageFee).toBeUndefined();
});
it('explains absent schedules instead of silently blocking issuance',()=>{
 mocks.useFlights.mockReturnValue({data:[],isPending:false,error:null,refetch:mocks.refetch});setup();expect(screen.getByText(/No matching inventory for MNL/)).toBeInTheDocument();expect(screen.getByRole('link',{name:/Add a matching schedule/})).toHaveAttribute('href','/admin/flights');expect(screen.getByRole('button',{name:'Assign & issue ticket'})).toBeDisabled();expect(screen.getByRole('spinbutton',{name:'Base fare'})).toBeEnabled();
});
it('disables baggage fees without baggage and blocks malformed quotes/references',()=>{
 setup();selectFlights();expect(screen.getByRole('spinbutton',{name:'Excess baggage fee'})).toBeDisabled();amount('Base fare','-1');expect(screen.getByRole('button',{name:'Assign & issue ticket'})).toBeDisabled();expect(screen.getByRole('alert')).toHaveTextContent('non-negative');amount('Base fare','1.001');expect(screen.getByRole('button',{name:'Assign & issue ticket'})).toBeDisabled();amount('Base fare','100');fireEvent.change(screen.getByRole('textbox',{name:/^PNR/}),{target:{value:'BAD'}});expect(screen.getByRole('alert')).toHaveTextContent('six uppercase');
});
it('resets overrides when inventory changes and restores its fare defaults',()=>{
 setup();selectFlights();amount('Base fare','100');fireEvent.change(screen.getByRole('combobox',{name:/^Flight 1/}),{target:{value:'FLT-2'}});expect(screen.getByRole('spinbutton',{name:'Base fare'})).toHaveValue(null);expect(screen.getByRole('spinbutton',{name:'Base fare'})).toHaveAttribute('placeholder','2990');
});
it('shows loading and recoverable inventory errors',()=>{
 const result=setup();cleanup();mocks.useFlights.mockReturnValue({data:[],isPending:true,error:null,refetch:mocks.refetch});render(<MemoryRouter><TicketPanel request={result}/></MemoryRouter>);expect(screen.getByRole('status')).toHaveTextContent('Loading matching inventory');cleanup();mocks.useFlights.mockReturnValue({data:[],isPending:false,error:new Error('Offline'),refetch:mocks.refetch});render(<MemoryRouter><TicketPanel request={result}/></MemoryRouter>);fireEvent.click(screen.getByRole('button',{name:'Retry inventory'}));expect(mocks.refetch).toHaveBeenCalledOnce();expect(screen.getByRole('button',{name:'Assign & issue ticket'})).toBeDisabled();
});
it('ignores stale preselected flight IDs that do not match the requested route',()=>{
 const r=makeDraft();r.status='APPROVED_FOR_TMC';r.tripDetails.itineraryLegs[0].preferredFlightId='FLT-3';render(<MemoryRouter><TicketPanel request={r}/></MemoryRouter>);expect(screen.getByRole('button',{name:'Assign & issue ticket'})).toBeDisabled();fireEvent.submit(screen.getByRole('button',{name:'Assign & issue ticket'}).closest('form')!);expect(mocks.issue).not.toHaveBeenCalled();
});

it('requires manager review for an over-budget quote instead of issuing it',()=>{
 const r=setup();selectFlights();amount('Base fare','160000');amount('Taxes & fees','0');expect(screen.getByRole('button',{name:'Assign & issue ticket'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Send quote for budget approval'}));expect(mocks.quote).toHaveBeenCalledWith(r.id,demoUsers[2],['FLT-1'],expect.objectContaining({baseFare:160000,taxesAndFees:0}));expect(mocks.issue).not.toHaveBeenCalled();
});
it('restores the reviewed quote after manager approval',()=>{
 const r=makeDraft();r.status='APPROVED_FOR_TMC';r.approvedBudgetPhp=6000;r.tmcQuote={flightIds:['FLT-1'],fulfillment:{baseFare:5000,taxesAndFees:0,tmcTravelConsultant:'Daniel'},total:5000,company:5000,employee:0,revision:1};render(<MemoryRouter><TicketPanel request={r}/></MemoryRouter>);expect(screen.getByRole('spinbutton',{name:'Base fare'})).toHaveValue(5000);expect(screen.getByRole('combobox',{name:/^Flight 1/})).toHaveValue('FLT-1');expect(screen.getByRole('button',{name:'Assign & issue ticket'})).toBeEnabled();
});
it('prefills inline inventory from the approved leg and prevents the editor from issuing a ticket',async()=>{
 setup();selectFlights();fireEvent.click(screen.getByRole('button',{name:'Add matching flight for leg 1'}));const dialog=await screen.findByRole('dialog');expect(within(dialog).getByRole('combobox',{name:'Origin'})).toHaveValue('MNL');expect(within(dialog).getByRole('combobox',{name:'Destination'})).toHaveValue('CEB');fireEvent.change(within(dialog).getByRole('textbox',{name:'Flight number'}),{target:{value:'PR999'}});fireEvent.click(within(dialog).getByRole('button',{name:'Save schedule'}));await waitFor(()=>expect(mocks.saveFlight).toHaveBeenCalledOnce());expect(mocks.issue).not.toHaveBeenCalled();expect(mocks.saveFlight.mock.calls[0][0].origin).toBe('MNL');
});
