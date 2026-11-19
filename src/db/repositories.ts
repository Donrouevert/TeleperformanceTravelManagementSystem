import { maximumPhp, validateTicketOverrides, type TicketOverrides } from '../lib/ticketing';
import { cloudMode } from '../lib/supabase';
import { CloudRepository } from './cloudRepository';
import { db, type TravelDatabase } from './dexie';
import type { FlightSchedule, TravelRequest, User, TmcFulfillment } from '../types/travel';
import { calculateCosts, validateRequest } from '../lib/policy';
import { cabinMultiplier, manilaDateTime } from '../lib/flights';
import { today } from '../lib/format';
const roleRequired = (user: User, role: User['role']) => { if (user.role !== role) throw new Error(`This action requires the ${role.toLowerCase()} role.`); };
export class TravelRepository {
  constructor(public database: TravelDatabase = db) {}
  async listRequests() { return this.database.requests.orderBy('createdAt').reverse().toArray(); }
  async listFlights() { return this.database.flights.toArray(); }
  async listUsers() { return this.database.users.toArray(); }
  async listEvents() { return this.database.events.orderBy('timestamp').reverse().limit(20).toArray(); }
  async event(message: string, requestId?: string) { await this.database.events.add({ id: crypto.randomUUID(), message, requestId, timestamp: new Date().toISOString() }); }
  async submit(request: TravelRequest, user: User) {
    roleRequired(user, 'REQUESTOR');
    if (request.requestor.employeeId !== user.employeeId) throw new Error('You may only submit your own requests.');
    const errors = validateRequest(request); if (errors.length) throw new Error(errors[0]);
    if (request.tripDetails.departureDate < today()) throw new Error('Departure date cannot be in the past.');
    const next: TravelRequest = { ...request, reference: `TR-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`, status: 'PENDING_ADMIN',approvedBudgetPhp:undefined,isRebooking:false,tmcQuote:undefined,correctionNote:undefined,revision:1,historyRecords:undefined,settledCompanyPhp:0,settledEmployeePhp:0, adminReview: undefined, tmcFulfillment: undefined, approval: { businessJustification: request.approval.businessJustification, requestedBySignature: request.approval.requestedBySignature, requestedDate: today(), excessBaggageAuthorized: false }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await this.database.transaction('rw', this.database.requests, this.database.events, async () => { await this.database.requests.add(next); await this.event(`${next.reference} submitted for approval`, next.id); }); return next;
  }
  async adminApprove(id: string, user: User, approved: boolean, remarks: string) {
    roleRequired(user, 'ADMIN'); if (!remarks.trim()) throw new Error('Admin review remarks are required.');
    return this.database.transaction('rw', this.database.requests, this.database.events, async () => {
      const r=await this.database.requests.get(id); if(!r || r.status!=='PENDING_ADMIN') throw new Error('Only requests awaiting admin review can proceed.');
      const next:TravelRequest={...r,status:approved?'PENDING_APPROVAL':'REJECTED',adminReview:{approved,reviewer:user.employeeName,date:today(),remarks:remarks.trim()},updatedAt:new Date().toISOString()};
      await this.database.requests.put(next); await this.event(r.reference+' admin review completed',id);return next;
    });
  }
  async approve(id: string, user: User, approved: boolean, signature: string, remarks: string, authorized: boolean,budget?:number) {
    roleRequired(user, 'MANAGER'); if (!signature.trim()) throw new Error('A manager signature is required.');
    if (!approved && !remarks.trim()) throw new Error('Please provide a reason for rejection.');
    return this.database.transaction('rw', this.database.requests, this.database.events, async () => {
      const request = await this.database.requests.get(id); if (!request) throw new Error('Request not found.');
      if (request.status !== 'PENDING_APPROVAL') throw new Error('Only pending requests may be approved or rejected.');
      if (request.requestor.approvingManagerId !== user.employeeId || request.requestor.employeeId === user.employeeId) throw new Error('You are not the assigned approving manager.');
      if(approved&&(budget===undefined||!Number.isFinite(budget)||budget<0||budget>maximumPhp||Math.abs(budget*100-Math.round(budget*100))>0.0001))throw new Error('Enter an approved total booking budget in PHP.');
      if(approved&&request.tmcQuote&&budget!<request.tmcQuote.total)throw new Error('Approved budget must cover the submitted TMC quote.');
      const next: TravelRequest = { ...request, historyRecords:this.record(request,user,'MANAGER_REVIEW',remarks),approvedBudgetPhp:approved?budget:undefined, status: approved ? 'APPROVED_FOR_TMC' : 'REJECTED', approval: { ...request.approval, approvedBySignature: signature.trim(), approvedDate: today(), excessBaggageAuthorized: approved && authorized, managerRemarks: remarks.trim() }, updatedAt: new Date().toISOString() };
      await this.database.requests.put(next); await this.event(`${request.reference} ${approved ? 'approved for TMC' : 'rejected'}`, id); return next;
    });
  }
  async returnForCorrection(id:string,user:User,note:string){
    if(note.trim().length<3)throw new Error('Describe the corrections required.');
    return this.database.transaction('rw',this.database.requests,this.database.events,async()=>{const r=await this.database.requests.get(id);if(!r||!(user.role==='ADMIN'&&r.status==='PENDING_ADMIN'||user.role==='MANAGER'&&r.status==='PENDING_APPROVAL'&&r.requestor.approvingManagerId===user.employeeId||user.role==='TMC'&&r.status==='REBOOKING_REQUESTED'))throw new Error('This request cannot be returned by your role.');
      const next:TravelRequest={...r,status:'CHANGES_REQUESTED',isRebooking:r.isRebooking||r.status==='REBOOKING_REQUESTED',correctionNote:note.trim(),approvedBudgetPhp:undefined,tmcQuote:undefined,historyRecords:this.record(r,user,'RETURNED_FOR_CORRECTION',note),approval:{...r.approval,excessBaggageAuthorized:false,managerRemarks:undefined,approvedBySignature:undefined,approvedDate:undefined},updatedAt:new Date().toISOString()};await this.database.requests.put(next);await this.event('Returned for correction: '+note,id);return next;});
  }
  private record(r:TravelRequest,user:User,kind:string,note=''){
    const {historyRecords:_,...snapshot}=r;return [...(r.historyRecords??[]),{id:crypto.randomUUID(),kind,note,created_at:new Date().toISOString(),snapshot:structuredClone(snapshot),actor:user.employeeId}];
  }
  async resubmit(id:string,input:TravelRequest,user:User,mode:'correction'|'rebook'){
    roleRequired(user,'REQUESTOR');const errors=validateRequest(input);if(errors.length)throw new Error(errors[0]);if(input.tripDetails.itineraryLegs.some(l=>l.date<today()))throw new Error('Choose future itinerary dates.');
    return this.database.transaction('rw',this.database.requests,this.database.events,async()=>{const r=await this.database.requests.get(id);if(!r||r.requestor.employeeId!==user.employeeId)throw new Error('Only the request owner can revise this journey.');if((input.revision??1)!==(r.revision??1))throw new Error('This request changed. Refresh before submitting your revision.');if(!(mode==='correction'&&r.status==='CHANGES_REQUESTED'||mode==='rebook'&&['TICKETED','REBOOKING_REQUESTED'].includes(r.status)))throw new Error('Request is not available for this revision.');
      const next:TravelRequest={...r,requestor:{...input.requestor,employeeId:user.employeeId,employeeName:user.employeeName,emailAddress:user.emailAddress,approvingManagerId:user.approvingManagerId,approvingManagerName:user.approvingManagerName},tripDetails:structuredClone(input.tripDetails),flightRequirements:structuredClone(input.flightRequirements),specialRequirements:structuredClone(input.specialRequirements),approval:{businessJustification:input.approval.businessJustification,requestedBySignature:input.approval.requestedBySignature,requestedDate:today(),excessBaggageAuthorized:false},status:'PENDING_ADMIN',adminReview:undefined,approvedBudgetPhp:undefined,correctionNote:undefined,tmcQuote:undefined,revision:(r.revision??1)+1,settledCompanyPhp:r.settledCompanyPhp??(r.tmcFulfillment?.paymentStatus!=='UNBILLED'?r.tmcFulfillment?.costsPhp.companyBillableTotal??0:0),settledEmployeePhp:r.settledEmployeePhp??(r.tmcFulfillment?.paymentStatus!=='UNBILLED'?r.tmcFulfillment?.costsPhp.employeePayableExcessFee??0:0),isRebooking:!!r.tmcFulfillment,historyRecords:this.record(r,user,mode==='rebook'?'REBOOKING_STARTED':'CORRECTION_RESUBMITTED'),updatedAt:new Date().toISOString()};await this.database.requests.put(next);await this.event('Revised request submitted for admin review',id);return next;});
  }
  async cancelRebooking(id:string,user:User){roleRequired(user,'REQUESTOR');return this.database.transaction('rw',this.database.requests,this.database.events,async()=>{
    const r=await this.database.requests.get(id);if(!r||r.requestor.employeeId!==user.employeeId||!r.tmcFulfillment||!(r.isRebooking||r.status==='REBOOKING_REQUESTED')||r.status==='TICKETED')throw new Error('Only the owner can withdraw pending rebooking changes.');
    const snapshot=[...(r.historyRecords??[])].reverse().find(h=>h.kind==='REBOOKING_STARTED')?.snapshot as TravelRequest|undefined;
    const next:TravelRequest={...(snapshot??r),id:r.id,reference:r.reference,status:'TICKETED',isRebooking:false,correctionNote:undefined,tmcQuote:undefined,tmcFulfillment:r.tmcFulfillment,settledCompanyPhp:r.settledCompanyPhp,settledEmployeePhp:r.settledEmployeePhp,historyRecords:this.record(r,user,'REBOOKING_WITHDRAWN'),updatedAt:new Date().toISOString()};await this.database.requests.put(next);await this.event('Rebooking changes withdrawn; original ticket retained',id);return next;
  });}
  async history(id:string){const r=await this.database.requests.get(id);return {requests:[...(r?.historyRecords??[])].reverse(),bookings:(r?.historyRecords??[]).filter(h=>h.kind==='TICKET_REPLACED').map(h=>({...h,snapshot:h.snapshot.tmcFulfillment??{}}))};}
  private reservation(r:TravelRequest){const initial=[...(r.historyRecords??[])].reverse().find(h=>h.kind==='REBOOKING_STARTED')?.snapshot as TravelRequest|undefined;return {cabin:r.tmcFulfillment?.reservedCabin??initial?.flightRequirements.cabinClass??r.flightRequirements.cabinClass,travelers:r.tmcFulfillment?.reservedTravelers??initial?.tripDetails.numberOfTravelers??r.tripDetails.numberOfTravelers};}
  private async buildQuote(r:TravelRequest,ids:string[],manual:TicketOverrides={},held=false){
    const errors=validateTicketOverrides(manual,r.flightRequirements.excessBaggageKg);if(errors.length)throw new Error(errors[0]);
    if(!ids.length||ids.length!==r.tripDetails.itineraryLegs.length||new Set(ids).size!==ids.length)throw new Error('Assign one distinct flight for every itinerary leg.');
    const schedules:FlightSchedule[]=[];let base=0,taxes=0,baggage=0;const reservation=this.reservation(r);
    for(let i=0;i<ids.length;i++){const f=await this.database.flights.get(ids[i]),leg=r.tripDetails.itineraryLegs[i];if(!f||f.status==='CANCELLED'||f.origin!==leg.origin||f.destination!==leg.destination||manilaDateTime(f.departureTimestamp)?.date!==leg.date||Date.parse(f.departureTimestamp)<=Date.now())throw new Error('Flight does not match itinerary leg '+(i+1)+'.');
      if(i&&Date.parse(f.departureTimestamp)<=Date.parse(schedules[i-1].arrivalTimestamp))throw new Error('Itinerary flight times overlap.');
      const credit=held&&r.tmcFulfillment?.flightIds.includes(f.id)&&reservation.cabin===r.flightRequirements.cabinClass?reservation.travelers:0;
      if(f.seats[r.flightRequirements.cabinClass]+credit<r.tripDetails.numberOfTravelers)throw new Error('Insufficient seats. Please choose another flight.');schedules.push(f);
      base+=Math.round((f.baseFare*cabinMultiplier[r.flightRequirements.cabinClass]*r.tripDetails.numberOfTravelers+Number.EPSILON)*100)/100;taxes+=f.taxesAndFees*r.tripDetails.numberOfTravelers;baggage+=f.baggageRatePerKg*r.flightRequirements.excessBaggageKg*r.tripDetails.numberOfTravelers;
    }
    const costs=calculateCosts(manual.baseFare??base,manual.taxesAndFees??taxes,manual.baggageFee??baggage,r.flightRequirements.excessBaggageKg,r.approval.excessBaggageAuthorized);if(costs.totalCost>maximumPhp)throw new Error('Total fare exceeds the supported PHP amount.');return {schedules,costs};
  }
  async quote(id:string,user:User,ids:string[],manual:TicketOverrides){roleRequired(user,'TMC');return this.database.transaction('rw',this.database.requests,this.database.flights,this.database.events,async()=>{
    const r=await this.database.requests.get(id);if(!r||r.status!=='APPROVED_FOR_TMC')throw new Error('Quote requires an approved itinerary.');const {costs}=await this.buildQuote(r,ids,manual,true);
    const next:TravelRequest={...r,status:'PENDING_APPROVAL',approvedBudgetPhp:undefined,approval:{...r.approval,approvedBySignature:undefined,approvedDate:undefined},tmcQuote:{flightIds:ids,fulfillment:manual,total:costs.totalCost,company:costs.companyBillableTotal,employee:costs.employeePayableExcessFee,revision:r.revision??1},historyRecords:this.record(r,user,'TMC_QUOTE_REVIEW'),updatedAt:new Date().toISOString()};await this.database.requests.put(next);await this.event('TMC quote sent for manager budget approval: '+costs.totalCost,id);return next;
  });}
  async issue(id:string,user:User,flightIds:string[],manual?:Partial<TmcFulfillment>&TicketOverrides){roleRequired(user,'TMC');return this.database.transaction('rw',this.database.requests,this.database.flights,this.database.events,async()=>{
    const r=await this.database.requests.get(id);if(!r)throw new Error('Request not found.');if(r.status!=='APPROVED_FOR_TMC'||!r.approval.approvedBySignature)throw new Error('Manager approval is required before ticket issuance.');if(r.approvedBudgetPhp===undefined)throw new Error('Manager must approve a total booking budget before ticketing.');if(r.tmcFulfillment&&!r.isRebooking)throw new Error('Ticket already issued.');
    const {schedules,costs}=await this.buildQuote(r,flightIds,manual,true);if(costs.totalCost>r.approvedBudgetPhp)throw new Error('Final fare exceeds the approved budget. Submit the quote for manager approval.');
    const pnr=manual?.bookingReferencePnr?.trim()||crypto.randomUUID().replaceAll('-','').slice(0,6).toUpperCase(),ticket=manual?.ticketNumber?.trim()||'079-'+crypto.randomUUID().replaceAll('-','');const existing=await this.database.requests.toArray();if(existing.some(x=>x.id!==id&&(x.tmcFulfillment?.bookingReferencePnr===pnr||x.tmcFulfillment?.ticketNumber===ticket)))throw new Error('PNR or ticket number already exists.');
    if(manual?.departureTimestamp&&Date.parse(manual.departureTimestamp)!==Date.parse(schedules[0].departureTimestamp))throw new Error('Departure must match the assigned inventory. Update the schedule first.');
    if(manual?.arrivalTimestamp&&Date.parse(manual.arrivalTimestamp)!==Date.parse(schedules.at(-1)!.arrivalTimestamp))throw new Error('Arrival must match the assigned inventory.');
    if(r.tmcFulfillment){const held=this.reservation(r);for(const oldId of r.tmcFulfillment.flightIds){const f=await this.database.flights.get(oldId);if(f){f.seats[held.cabin]+=held.travelers;await this.database.flights.put(f);}}}
    for(const id of flightIds){const f=(await this.database.flights.get(id))!;if(f.seats[r.flightRequirements.cabinClass]<r.tripDetails.numberOfTravelers)throw new Error('Insufficient seats.');f.seats[r.flightRequirements.cabinClass]-=r.tripDetails.numberOfTravelers;await this.database.flights.put(f);}
    const fulfillment:TmcFulfillment={tmcTravelConsultant:manual?.tmcTravelConsultant?.trim()||user.employeeName,bookingReferencePnr:pnr,airline:schedules.map(f=>f.airline).join(' / '),flightNumber:schedules.map(f=>f.flightNumber).join(' / '),departureTimestamp:schedules[0].departureTimestamp,arrivalTimestamp:schedules.at(-1)!.arrivalTimestamp,ticketNumber:ticket,costsPhp:costs,bookingDate:today(),paymentStatus:r.tmcFulfillment?.paymentStatus!=='UNBILLED'&&r.tmcFulfillment&&costs.companyBillableTotal===(r.settledCompanyPhp??0)&&costs.employeePayableExcessFee===(r.settledEmployeePhp??0)?r.tmcFulfillment.paymentStatus:'UNBILLED',flightIds,reservedCabin:r.flightRequirements.cabinClass,reservedTravelers:r.tripDetails.numberOfTravelers};
    const next:TravelRequest={...r,status:'TICKETED',isRebooking:false,tmcQuote:undefined,tmcFulfillment:fulfillment,historyRecords:r.tmcFulfillment?this.record(r,user,'TICKET_REPLACED'):r.historyRecords,updatedAt:new Date().toISOString()};await this.database.requests.put(next);await this.event('PNR '+pnr+' issued for '+r.requestor.employeeName,id);return next;
  });}
  async requestRebooking(id: string, user: User) {
    roleRequired(user, 'REQUESTOR'); return this.database.transaction('rw', this.database.requests, this.database.events, async () => {
      const r = await this.database.requests.get(id); if (!r || r.status !== 'TICKETED' || r.requestor.employeeId !== user.employeeId) throw new Error('Only your own ticketed requests can be sent for rebooking.');
      const next: TravelRequest = { ...r, status: 'REBOOKING_REQUESTED', specialRequirements: { ...r.specialRequirements, flightChangeRebookingAssistance: true }, updatedAt: new Date().toISOString() };
      await this.database.requests.put(next); await this.event(`${r.reference} requires rebooking assistance`, id); return next;
    });
  }
  async settle(id: string, user: User) {
    roleRequired(user, 'TMC'); return this.database.transaction('rw', this.database.requests, this.database.events, async () => {
      const r = await this.database.requests.get(id); if (!r?.tmcFulfillment || r.tmcFulfillment.paymentStatus !== 'UNBILLED') throw new Error('This booking cannot be settled.');
      r.settledCompanyPhp=r.tmcFulfillment.costsPhp.companyBillableTotal;r.settledEmployeePhp=r.tmcFulfillment.costsPhp.employeePayableExcessFee;
      r.tmcFulfillment.paymentStatus = r.tmcFulfillment.costsPhp.employeePayableExcessFee > 0 ? 'SPLIT_SETTLED' : 'COST_CENTER_CHARGED'; r.updatedAt = new Date().toISOString();
      await this.database.requests.put(r); await this.event(`${r.reference} payment reconciled`, id); return r;
    });
  }
  async saveFlight(flight: FlightSchedule, user: User) {
    roleRequired(user, 'TMC');
    if (!flight.airline || !flight.flightNumber.trim() || flight.origin === flight.destination || !Number.isFinite(Date.parse(flight.departureTimestamp)) || !Number.isFinite(Date.parse(flight.arrivalTimestamp)) || Date.parse(flight.arrivalTimestamp) <= Date.parse(flight.departureTimestamp)) throw new Error('Check route, flight number and chronological flight times.');
    for (const key of ['baseFare','taxesAndFees','baggageAllowanceKg','baggageRatePerKg','co2Kg'] as const) if (!Number.isFinite(flight[key]) || flight[key] < 0) throw new Error('Fares and allowances must be non-negative.');
    for (const cabin of ['Economy','Premium Economy','Business'] as const) if (!Number.isInteger(flight.seats[cabin]) || flight.seats[cabin] < 0 || !Number.isInteger(flight.capacity[cabin]) || flight.capacity[cabin] < flight.seats[cabin]) throw new Error('Seat availability must be within cabin capacity.');
    await this.database.transaction('rw', this.database.flights, this.database.requests, this.database.events, async () => {
      const previous = await this.database.flights.get(flight.id);
      const used = (await this.database.requests.toArray()).some(r => r.tmcFulfillment?.flightIds.includes(flight.id));
      if (used && previous && ['origin','destination','departureTimestamp','arrivalTimestamp','airline','flightNumber'].some(k => previous[k as keyof FlightSchedule] !== flight[k as keyof FlightSchedule])) throw new Error('Ticketed schedule identity and times cannot be changed. Create a replacement schedule.');
      if (used && previous) for (const c of ['Economy','Premium Economy','Business'] as const) if (flight.capacity[c] - flight.seats[c] < previous.capacity[c] - previous.seats[c]) throw new Error('Seat changes cannot erase existing reservations.');
      await this.database.flights.put(flight); await this.event(`Schedule ${flight.flightNumber} updated`);
    }); return flight;
  }
  async deleteFlight(id: string, user: User) {
    roleRequired(user, 'TMC'); await this.database.transaction('rw', this.database.flights, this.database.requests, this.database.events, async () => {
      const used = (await this.database.requests.toArray()).some(r => r.tmcFulfillment?.flightIds.includes(id)); if (used) throw new Error('A ticketed flight cannot be deleted. Change its status instead.');
      await this.database.flights.delete(id); await this.event('An unused flight schedule was removed');
    });
  }
}
export const repository = cloudMode ? new CloudRepository() : new TravelRepository();
