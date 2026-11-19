import {cleanup,render,screen} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import * as Tooltip from '@radix-ui/react-tooltip';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {RoleDashboard} from '../features/dashboard/RoleDashboard';
import {SidebarContent} from '../components/layout/SidebarContent';
import {RoleGate} from '../components/RoleGate';
import {makeDraft,demoUsers,createSeedFlights} from '../db/seed';
import {FlightDirectory} from '../features/flights/FlightDirectory';
import type {Role,TravelRequest} from '../types/travel';
const state=vi.hoisted(()=>({role:'REQUESTOR' as Role}));
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:{...demoUsers.find(u=>u.role===state.role)!,role:state.role}})}));
vi.mock('../lib/modules',()=>({preloadModule:vi.fn()}));
vi.mock('../hooks/useTravel',()=>({useRequests:()=>({data:records(),isPending:false,error:null}),useFlights:()=>({data:createSeedFlights(),isPending:false,error:null})}));
function records(){return ['PENDING_ADMIN','PENDING_APPROVAL','APPROVED_FOR_TMC','CHANGES_REQUESTED'].map((status,i)=>({...makeDraft(),id:'request-'+i,reference:'TR-'+i,status,approvedBudgetPhp:10000,revision:1} as TravelRequest));}
beforeEach(()=>{state.role='REQUESTOR';});afterEach(()=>{cleanup();vi.clearAllMocks();});
it.each([
 ['REQUESTOR','My travel dashboard','My next journey','Plan a journey'],
 ['ADMIN','Admin intake dashboard','Intake checklist','Review intake'],
 ['MANAGER','Manager approval dashboard','Spending authorization','Review approvals'],
 ['TMC','TMC fulfillment dashboard','Inventory coverage','Open dispatch']
] as const)('gives %s a distinct dashboard and task focus using shared cards', (role,title,focus,primary)=>{
 state.role=role;const {container}=render(<MemoryRouter><RoleDashboard/></MemoryRouter>);expect(screen.getByRole('heading',{level:1,name:title})).toBeInTheDocument();expect(screen.getByRole('heading',{name:focus})).toBeInTheDocument();expect(screen.getByRole('link',{name:primary})).toBeInTheDocument();expect(container.querySelectorAll('.role-metrics>.card').length).toBe(role==='TMC'?4:3);if(role!=='REQUESTOR')expect(screen.queryByRole('link',{name:'Plan a journey'})).toBeNull();if(role!=='TMC')expect(screen.queryByRole('link',{name:'Reconcile billing'})).toBeNull();
});
it.each(['REQUESTOR','ADMIN','MANAGER','TMC'] as const)('limits %s navigation to applicable modules',role=>{
 state.role=role;render(<MemoryRouter><Tooltip.Provider><SidebarContent user={demoUsers.find(u=>u.role===role)!} pending={1} onNavigate={()=>{}}/></Tooltip.Provider></MemoryRouter>);const ops=screen.queryByRole('link',{name:'Flight operations'}),billing=screen.queryByRole('link',{name:'Payments & billing'});if(role==='TMC'){expect(ops).toBeInTheDocument();expect(billing).toBeInTheDocument();}else{expect(ops).toBeNull();expect(billing).toBeNull();}expect(screen.getByRole('link',{name:'Find a flight'})).toBeInTheDocument();
});
it.each(['REQUESTOR','ADMIN','MANAGER','TMC'] as const)('guards direct request creation URLs for %s',role=>{
 state.role=role;render(<MemoryRouter initialEntries={['/bookings/new']}><Routes><Route path="/bookings/new" element={<RoleGate roles={['REQUESTOR']}><h1>Request editor</h1></RoleGate>}/><Route path="/dashboard" element={<h1>Dashboard</h1>}/></Routes></MemoryRouter>);expect(screen.getByRole('heading',{name:role==='REQUESTOR'?'Request editor':'Dashboard'})).toBeInTheDocument();
});
it.each(['REQUESTOR','ADMIN','MANAGER','TMC'] as const)('guards direct TMC-only URLs for %s',role=>{
 state.role=role;render(<MemoryRouter initialEntries={['/payments']}><Routes><Route path="/payments" element={<RoleGate roles={['TMC']}><h1>Billing</h1></RoleGate>}/><Route path="/dashboard" element={<h1>Dashboard</h1>}/></Routes></MemoryRouter>);expect(screen.getByRole('heading',{name:role==='TMC'?'Billing':'Dashboard'})).toBeInTheDocument();
});
it('keeps shared flight reference fares available without request-creation actions',()=>{
 render(<FlightDirectory flights={createSeedFlights().slice(0,1)} cabin="Economy" tripType="One-Way" travelers={1} valid bookingEnabled={false} onSelect={vi.fn()}/>);expect(screen.queryByRole('button',{name:'BOOK NOW'})).toBeNull();expect(screen.getByText('Reference fare')).toBeInTheDocument();expect(screen.getByRole('table')).toBeInTheDocument();
});
