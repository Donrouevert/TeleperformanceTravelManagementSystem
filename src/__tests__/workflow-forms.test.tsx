import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ApprovalPanel,AdminReviewPanel} from '../features/bookings/RequestDetail';
import {RevisionPage} from '../features/bookings/BookingWizard';
import {demoUsers,makeDraft} from '../db/seed';
import type {TravelRequest} from '../types/travel';
const mocks=vi.hoisted(()=>({role:'MANAGER',request:null as TravelRequest|null,approve:vi.fn(),returnForCorrection:vi.fn(),resubmit:vi.fn(),adminApprove:vi.fn()}));
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:demoUsers.find(u=>u.role===mocks.role)!})}));
vi.mock('../db/repositories',()=>({repository:mocks}));
vi.mock('../hooks/useTravel',()=>({useRequests:()=>({data:[mocks.request],isPending:false,error:null}),useTravelMutation:(fn:(input:any)=>Promise<any>)=>({isPending:false,error:null,mutate:(input:any)=>void fn(input)})}));
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-15T04:00:00Z'));mocks.role='MANAGER';mocks.request=makeDraft();mocks.request.status='PENDING_APPROVAL';mocks.request.approval.businessJustification='Quarterly customer business planning';mocks.approve.mockResolvedValue({});mocks.returnForCorrection.mockResolvedValue({});mocks.resubmit.mockResolvedValue({});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();});
it('requires the manager to enter a spending limit and sends it with the decision',()=>{
 render(<MemoryRouter><ApprovalPanel request={mocks.request!}/></MemoryRouter>);const approve=screen.getByRole('button',{name:'Approve budget & forward to TMC'});expect(approve).toBeDisabled();fireEvent.change(screen.getByRole('spinbutton',{name:'Approved total booking budget · PHP'}),{target:{value:'10000'}});fireEvent.click(approve);expect(mocks.approve).toHaveBeenCalledWith(mocks.request!.id,demoUsers[1],true,demoUsers[1].employeeName,'',false,10000);expect(screen.queryByRole('button',{name:'Assign & issue ticket'})).toBeNull();
});
it('returns admin intake for correction with actionable remarks',()=>{
 mocks.role='ADMIN';mocks.request!.status='PENDING_ADMIN';render(<MemoryRouter><AdminReviewPanel request={mocks.request!}/></MemoryRouter>);const action=screen.getByRole('button',{name:'Return for correction'});expect(action).toBeDisabled();fireEvent.change(screen.getByRole('textbox',{name:'Admin review remarks'}),{target:{value:'Confirm the project code'}});fireEvent.click(action);expect(mocks.returnForCorrection).toHaveBeenCalledWith(mocks.request!.id,demoUsers.find(u=>u.role==='ADMIN'),'Confirm the project code');expect(screen.queryByRole('spinbutton',{name:/Approved total/})).toBeNull();
});
it('opens the existing request in the correction wizard and resubmits the same record',()=>{
 mocks.role='REQUESTOR';mocks.request!.status='CHANGES_REQUESTED';mocks.request!.correctionNote='Update the estimate';render(<MemoryRouter initialEntries={['/bookings/'+mocks.request!.id+'/edit']}><Routes><Route path="/bookings/:id/edit" element={<RevisionPage/>}/></Routes></MemoryRouter>);expect(screen.getByRole('heading',{name:'Correct travel request'})).toBeInTheDocument();expect(screen.getByText(/Update the estimate/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Continue'}));fireEvent.change(screen.getByRole('spinbutton',{name:'Estimated total booking cost · PHP'}),{target:{value:'7500'}});for(let i=0;i<3;i++)fireEvent.click(screen.getByRole('button',{name:'Continue'}));fireEvent.click(screen.getByRole('button',{name:'Submit revised request'}));expect(mocks.resubmit).toHaveBeenCalledWith(mocks.request!.id,expect.objectContaining({id:mocks.request!.id,tripDetails:expect.objectContaining({estimatedTotalPhp:7500})}),demoUsers[0],'correction');
});
it('blocks revision URLs for a record that is not owned by the requestor',()=>{
 mocks.role='REQUESTOR';mocks.request!.status='CHANGES_REQUESTED';mocks.request!.requestor.employeeId='OTHER';render(<MemoryRouter initialEntries={['/bookings/'+mocks.request!.id+'/edit']}><Routes><Route path="/bookings/:id/edit" element={<RevisionPage/>}/></Routes></MemoryRouter>);expect(screen.getByRole('heading',{name:'This request is unavailable for revision'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Continue'})).toBeNull();
});
