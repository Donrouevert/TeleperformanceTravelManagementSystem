import { expect,it,vi,beforeEach } from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn()}));
vi.mock('../lib/supabase',()=>({supabase:mocks}));
import { CloudRepository } from '../db/cloudRepository';
import { makeDraft,demoUsers } from '../db/seed';
beforeEach(()=>{vi.clearAllMocks();mocks.from.mockReturnValue({select:()=>({limit:async()=>({error:{message:'column admin_review does not exist'}})})});});
it('refuses new cloud submissions until the admin migration is active',async()=>{const repo=new CloudRepository();await expect(repo.submit(makeDraft(),demoUsers[0])).rejects.toThrow('migration');expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.from).toHaveBeenCalledTimes(1);});
it('refuses cloud approvals through an unmigrated backend',async()=>{const repo=new CloudRepository();await expect(repo.approve('id',demoUsers[1],true,'Manager','Checked',false,150000)).rejects.toThrow('migration');expect(mocks.rpc).not.toHaveBeenCalled();});
it.each([true,false])('maps one-to-one bookings returned as an object or array (%s)',async asArray=>{const booking={base_fare:'100',taxes_and_fees:'20',baggage_fee:'10',total_cost:'130',company_billable_total:'120',employee_payable_excess_fee:'10',booking_reference_pnr:'ABC123',booking_legs:[{leg_number:1,flight_id:'flight-1'}]};mocks.from.mockReturnValue({select:()=>({order:async()=>({data:[{id:'request-1',bookings:asArray?[booking]:booking}],error:null})})});const rows=await new CloudRepository().listRequests();expect(rows[0].tmcFulfillment?.bookingReferencePnr).toBe('ABC123');expect(rows[0].tmcFulfillment?.costsPhp.companyBillableTotal).toBe(120);expect(rows[0].tmcFulfillment?.flightIds).toEqual(['flight-1']);});
