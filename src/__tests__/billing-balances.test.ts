import {expect,it} from 'vitest';
import {billingBalance,ledgerCsv} from '../lib/billing';
import {makeDraft} from '../db/seed';
import type {TravelRequest} from '../types/travel';
function record():TravelRequest{const r=makeDraft();r.reference='TEST-1';r.requestor.employeeName='=1+1';r.settledCompanyPhp=3500;r.settledEmployeePhp=1000;r.tmcFulfillment={tmcTravelConsultant:'Consultant',bookingReferencePnr:'ABC123',airline:'Airline',flightNumber:'PR1',departureTimestamp:'2040-01-01',arrivalTimestamp:'2040-01-02',ticketNumber:'079-1',costsPhp:{baseFare:2000,taxesAndFees:0,baggageFee:0,totalCost:2000,companyBillableTotal:2000,employeePayableExcessFee:0},bookingDate:'2040-01-01',paymentStatus:'UNBILLED',flightIds:['flight-1']};return r;}
it('calculates signed balances and credits from previously reconciled amounts',()=>{expect(billingBalance(record())).toEqual({company:-1500,employee:-1000,total:-2500});});
it('exports aligned columns, numeric credits and safe text fields',()=>{const csv=ledgerCsv([record()]),[header,row]=csv.slice(1).split('\r\n');expect(header.split(',')).toHaveLength(13);expect(row.split(',')).toHaveLength(13);expect(csv).toContain('"Company balance PHP"');expect(csv).toContain('"-1500"');expect(csv).toContain('"\'=1+1"');expect(csv).not.toContain('"\'-1500"');});
