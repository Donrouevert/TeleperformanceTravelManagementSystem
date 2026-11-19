import {beforeEach,expect,it,vi} from 'vitest';
import {demoUsers} from '../db/seed';
const mocks=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn()}));
vi.mock('../lib/supabase',()=>({supabase:mocks}));
import {CloudRepository} from '../db/cloudRepository';
beforeEach(()=>{vi.clearAllMocks();mocks.rpc.mockResolvedValue({data:{},error:null});mocks.from.mockReturnValue({select:()=>({limit:async()=>({error:null}),order:async()=>({data:[{id:'request-1',bookings:[]}],error:null})})});});
it('sends explicit manual fields through the protected cloud RPC, including zero values',async()=>{
 const repo=new CloudRepository();await repo.issue('request-1',demoUsers[2],['f-1','f-2'],{baseFare:0,taxesAndFees:100,baggageFee:0,bookingReferencePnr:'ABC123',ticketNumber:'079-123',tmcTravelConsultant:'Daniel'});expect(mocks.rpc).toHaveBeenCalledWith('issue_travel_ticket',{p_request_id:'request-1',p_flight_ids:['f-1','f-2'],p_fulfillment:{baseFare:0,taxesAndFees:100,baggageFee:0,bookingReferencePnr:'ABC123',ticketNumber:'079-123',tmcTravelConsultant:'Daniel'}});
});
it('keeps absent amounts absent so the database uses inventory defaults',async()=>{await new CloudRepository().issue('request-1',demoUsers[2],['f-1']);const payload=JSON.parse(JSON.stringify(mocks.rpc.mock.calls[0][1]));expect(payload.p_fulfillment).toEqual({});});
it('blocks malformed monetary input before transport and surfaces backend errors',async()=>{await expect(new CloudRepository().issue('request-1',demoUsers[2],['f-1'],{baseFare:-1})).rejects.toThrow('non-negative');expect(mocks.rpc).not.toHaveBeenCalled();mocks.rpc.mockResolvedValue({error:{message:'PNR or ticket number already exists'}});await expect(new CloudRepository().issue('request-1',demoUsers[2],['f-1'])).rejects.toThrow('already exists');});
