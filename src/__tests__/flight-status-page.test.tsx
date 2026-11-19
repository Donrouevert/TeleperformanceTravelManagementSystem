import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {FlightStatus} from '../features/flights/FlightStatus';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),errorToast:vi.fn(),from:vi.fn(),select:vi.fn(),eq:vi.fn(),order:vi.fn(),limit:vi.fn()}));
vi.mock('../lib/supabase',()=>({supabase:{functions:{invoke:mocks.invoke},from:mocks.from}}));
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:{authId:'account-one',employeeId:'EMP-1'}})}));
vi.mock('sonner',()=>({toast:{error:mocks.errorToast}}));
const payload=()=>({data:[{flight_date:'2026-11-15',flight_status:'active',flight:{iata:'PR2845',number:'2845'},airline:{name:'Philippine Airlines'},departure:{iata:'MNL',airport:'Ninoy Aquino International',scheduled:'2026-11-15T08:00:00Z',terminal:'2',gate:'4',delay:15},arrival:{iata:'CEB',airport:'Mactan-Cebu International',scheduled:'2026-11-15T09:30:00Z'}}],fetchedAt:new Date().toISOString(),cached:false});
const demoRows=()=>[{id:'demo-one',airline:'Philippine Airlines',flight_number:'DEMO01A',origin:'MNL',destination:'CEB',departure_timestamp:'2027-02-02T00:00:00Z',arrival_timestamp:'2027-02-02T01:30:00Z',status:'SCHEDULED'}];
let client:QueryClient;
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-15T08:30:00Z'));client=new QueryClient();mocks.from.mockReturnValue({select:mocks.select,eq:mocks.eq,order:mocks.order,limit:mocks.limit});mocks.select.mockReturnThis();mocks.eq.mockReturnThis();mocks.order.mockReturnThis();mocks.limit.mockResolvedValue({data:demoRows(),error:null});mocks.invoke.mockResolvedValue({data:payload(),error:null});});
afterEach(()=>{cleanup();client.clear();vi.useRealTimers();vi.clearAllMocks();});
const open=()=>render(<QueryClientProvider client={client}><FlightStatus/></QueryClientProvider>);
const submit=(code='pr - 2845')=>{fireEvent.change(screen.getByRole('textbox',{name:'Flight number'}),{target:{value:code}});fireEvent.click(screen.getByRole('button',{name:'Check status'}));};
describe('On-demand flight-status page',()=>{
 it('makes no request on mount, keystrokes or invalid input',()=>{open();expect(mocks.invoke).not.toHaveBeenCalled();fireEvent.change(screen.getByRole('textbox',{name:'Flight number'}),{target:{value:'PR'}});expect(mocks.invoke).not.toHaveBeenCalled();submit('DEMO!01A');expect(screen.getByRole('alert')).toHaveTextContent('IATA flight number');expect(mocks.errorToast).toHaveBeenCalledOnce();expect(mocks.invoke).not.toHaveBeenCalled();});
 it('renders the complete PHT card and reuses the cache without focus or invalidation requests',async()=>{const view=open();submit();await screen.findByText('Active / En Route');expect(mocks.invoke).toHaveBeenCalledWith('aviationstack',expect.objectContaining({body:{flight_iata:'PR2845'}}));expect(screen.getByText('Ninoy Aquino International')).toBeInTheDocument();expect(screen.getByText('15 min')).toBeInTheDocument();expect(screen.getAllByText(/16:00.*PHT/).length).toBeGreaterThan(0);submit();await screen.findByText(/Cached response/);expect(mocks.invoke).toHaveBeenCalledOnce();await act(async()=>{window.dispatchEvent(new Event('focus'));await client.invalidateQueries({queryKey:['aviationstack']});});expect(mocks.invoke).toHaveBeenCalledOnce();view.unmount();open();expect(mocks.invoke).toHaveBeenCalledOnce();submit();await screen.findByText(/Cached response/);expect(mocks.invoke).toHaveBeenCalledOnce();});
 it('does not refresh a stale result until another explicit submission',async()=>{open();submit();await screen.findByText('Active / En Route');vi.setSystemTime(new Date('2026-11-15T08:46:00Z'));await act(async()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));});expect(mocks.invoke).toHaveBeenCalledOnce();submit();await waitFor(()=>expect(mocks.invoke).toHaveBeenCalledTimes(2));});
 it('shows cached empty data honestly instead of fabricating scheduled status',async()=>{mocks.invoke.mockResolvedValue({data:{data:[],cached:true,fetchedAt:'2026-11-15T08:29:00Z'},error:null});open();submit();await screen.findByRole('heading',{name:'No live status found for PR2845'});expect(screen.getByText(/Cached response/)).toBeInTheDocument();expect(screen.queryByText('Active / En Route')).not.toBeInTheDocument();});
 it('surfaces errors inside HTTP 200 as both toast and alert',async()=>{mocks.invoke.mockResolvedValue({data:{error:{code:'usage_limit_reached'}},error:null});open();submit();expect(await screen.findByRole('alert')).toHaveTextContent('monthly quota');expect(mocks.errorToast).toHaveBeenCalledOnce();expect(mocks.invoke).toHaveBeenCalledOnce();});
 it('preserves a safe server error returned by functions.invoke',async()=>{mocks.invoke.mockResolvedValue({data:null,error:{context:new Response(JSON.stringify({error:'The flight data service key is not configured.'}),{status:503})}});open();submit();expect(await screen.findByRole('alert')).toHaveTextContent('key is not configured');expect(mocks.errorToast).toHaveBeenCalledOnce();});
});

describe('Demo schedule fallback',()=>{
 it('looks up normalized demo codes in Supabase, displays future PHT schedules and reuses its own cache',async()=>{
  open();expect(mocks.from).not.toHaveBeenCalled();submit('demo - 01 a');await screen.findByText('Demo flight · Scheduled');expect(mocks.from).toHaveBeenCalledWith('flight_schedules');expect(mocks.eq).toHaveBeenCalledWith('flight_number','DEMO01A');expect(mocks.invoke).not.toHaveBeenCalled();expect(screen.getByText('Demonstration data')).toBeInTheDocument();expect(screen.getByText('It is not a live airline update.',{exact:false})).toBeInTheDocument();expect(screen.getAllByText(/Feb.*2.*2027.*08:00.*PHT/).length).toBeGreaterThan(0);
  submit('DEMO01A');await screen.findByText(/Cached demo schedule/);expect(mocks.from).toHaveBeenCalledOnce();await act(async()=>{window.dispatchEvent(new Event('focus'));await client.invalidateQueries({queryKey:['demo-flight-status']});});expect(mocks.from).toHaveBeenCalledOnce();expect(mocks.invoke).not.toHaveBeenCalled();
 });
 it('shows a missing demo schedule without spending provider quota',async()=>{
  mocks.limit.mockResolvedValue({data:[],error:null});open();submit('DEMO99A');await screen.findByRole('heading',{name:'No demo schedule found for DEMO99A'});expect(mocks.invoke).not.toHaveBeenCalled();submit('DEMO99A');await screen.findByText(/Cached demo schedule/);expect(mocks.from).toHaveBeenCalledOnce();
 });
 it('keeps real and demo responses separate when switching codes',async()=>{
  open();submit('DEMO01A');await screen.findByText('Demo flight · Scheduled');submit('PR2845');await screen.findByText('Active / En Route');expect(screen.queryByText('Demonstration data')).not.toBeInTheDocument();submit('DEMO01A');await screen.findByText('Demo flight · Scheduled');expect(screen.queryByText('Active / En Route')).not.toBeInTheDocument();expect(mocks.from).toHaveBeenCalledOnce();expect(mocks.invoke).toHaveBeenCalledOnce();
 });
 it('shows a clear database error without falling through to the live provider',async()=>{
  mocks.limit.mockResolvedValue({data:null,error:{message:'private database details'}});open();submit('DEMO01A');expect(await screen.findByRole('alert')).toHaveTextContent('Unable to read demo flight schedules');expect(screen.getByRole('alert')).not.toHaveTextContent('private database');expect(mocks.errorToast).toHaveBeenCalledOnce();expect(mocks.invoke).not.toHaveBeenCalled();
 });
 it.each([['DELAYED','Delayed'],['CANCELLED','Cancelled']])('uses the saved %s demo status without inventing live progress',async(status,label)=>{
  mocks.limit.mockResolvedValue({data:demoRows().map(row=>({...row,status})),error:null});open();submit('DEMO01A');await screen.findByText('Demo flight · '+label);expect(screen.queryByText('Active / En Route')).not.toBeInTheDocument();expect(mocks.invoke).not.toHaveBeenCalled();
 });
 it('refreshes an expired demo cache only after another explicit check',async()=>{
  open();submit('DEMO01A');await screen.findByText('Demo flight · Scheduled');vi.setSystemTime(new Date('2026-11-15T08:46:00Z'));await act(async()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));});expect(mocks.from).toHaveBeenCalledOnce();mocks.limit.mockResolvedValue({data:demoRows().map(row=>({...row,status:'DELAYED'})),error:null});submit('DEMO01A');await screen.findByText('Demo flight · Delayed');expect(mocks.from).toHaveBeenCalledTimes(2);expect(mocks.invoke).not.toHaveBeenCalled();
 });
});
