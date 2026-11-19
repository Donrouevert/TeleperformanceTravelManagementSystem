import { describe, expect, it } from 'vitest';
import { calculateCosts, validateRequest } from '../lib/policy';
import { makeDraft } from '../db/seed';
describe('Excess baggage split billing',()=>{
  it('allocates unauthorized excess baggage to the passenger',()=>{expect(calculateCosts(10000,1500,2500,10,false)).toEqual({baseFare:10000,taxesAndFees:1500,baggageFee:2500,totalCost:14000,employeePayableExcessFee:2500,companyBillableTotal:11500});});
  it('allocates manager-authorized excess baggage to the company',()=>{const c=calculateCosts(10000,1500,2500,10,true);expect(c.employeePayableExcessFee).toBe(0);expect(c.companyBillableTotal).toBe(14000);});
  it('charges standard baggage at zero excess fee',()=>{const c=calculateCosts(3850,650,0,0,false);expect(c.totalCost).toBe(4500);expect(c.companyBillableTotal).toBe(4500);expect(c.employeePayableExcessFee).toBe(0);});
  it('rounds monetary components to centavos',()=>{const c=calculateCosts(100.105,5.555,1.225,1,false);expect(c.totalCost).toBe(106.9);expect(c.companyBillableTotal+c.employeePayableExcessFee).toBeCloseTo(c.totalCost,2);});
  it.each([-1,NaN,Infinity])('rejects invalid amounts %s',value=>{expect(()=>calculateCosts(value,0,0,0,false)).toThrow();});
  it('rejects baggage fees when there is no excess baggage',()=>expect(()=>calculateCosts(100,20,500,0,false)).toThrow());
});
describe('Form validation',()=>{
  it('rejects whitespace-only destination and cost center',()=>{const r=makeDraft();r.tripDetails.destinationCountryCity='   ';r.requestor.costCenterProjectCode='   ';const errors=validateRequest(r);expect(errors).toContain('Complete the destination, departure date and preferred time.');expect(errors).toContain('Complete all requestor and cost center fields.');});
  it('enforces the justification minimum after trimming',()=>{const r=makeDraft();r.approval.businessJustification='    Visit    ';expect(validateRequest(r)).toContain('Business justification must contain at least 10 characters.');});
  it('requires return-time preference only for round trips',()=>{const r=makeDraft();r.approval.businessJustification='Quarterly regional customer planning';expect(validateRequest(r)).not.toContain('Preferred return time is required for round trips.');r.tripDetails.tripType='Round Trip';r.tripDetails.returnDate=r.tripDetails.departureDate;expect(validateRequest(r)).toContain('Preferred return time is required for round trips.');r.tripDetails.preferredReturnTime='15:00';expect(validateRequest(r)).toEqual([]);});
  it('requires justification and signature',()=>{const r=makeDraft();r.approval.requestedBySignature='';expect(validateRequest(r)).toContain('Business justification and requestor signature are required.');});
  it('rejects return dates before departure',()=>{const r=makeDraft();r.tripDetails.tripType='Round Trip';r.tripDetails.returnDate='2020-01-01';expect(validateRequest(r)).toContain('Return date must be on or after departure.');});
  it('requires additional baggage quantity',()=>{const r=makeDraft();r.flightRequirements.baggageRequirement='Additional Baggage';expect(validateRequest(r)).toContain('Enter the additional baggage weight.');});
  it('accepts a complete request',()=>{const r=makeDraft();r.approval.businessJustification='Quarterly regional customer planning';expect(validateRequest(r)).toEqual([]);});
});
