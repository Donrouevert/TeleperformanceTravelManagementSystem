import type { CostsPhp, TravelRequest } from '../types/travel';
export function calculateCosts(baseFare: number, taxesAndFees: number, baggageFee: number, excessBaggageKg: number, authorized: boolean): CostsPhp {
  for (const n of [baseFare, taxesAndFees, baggageFee, excessBaggageKg]) if (!Number.isFinite(n) || n < 0) throw new Error('Fare, fees and baggage must be non-negative numbers.');
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fare = round(baseFare), taxes = round(taxesAndFees), baggage = round(baggageFee);
  if (excessBaggageKg === 0 && baggage > 0) throw new Error('An excess baggage fee requires a positive baggage quantity.');
  const employeePayableExcessFee = excessBaggageKg > 0 && !authorized ? baggage : 0;
  const totalCost = round(fare + taxes + baggage);
  return { baseFare: fare, taxesAndFees: taxes, baggageFee: baggage, totalCost, employeePayableExcessFee, companyBillableTotal: round(totalCost - employeePayableExcessFee) };
}
export function validateRequest(r: TravelRequest): string[] {
  const a = r.requestor, b = r.tripDetails, c = r.flightRequirements, e = r.approval;
  const errors: string[] = [];
  if(b.estimatedTotalPhp!==undefined&&(!Number.isFinite(b.estimatedTotalPhp)||b.estimatedTotalPhp<0||b.estimatedTotalPhp>9999999999.99||Math.abs(b.estimatedTotalPhp*100-Math.round(b.estimatedTotalPhp*100))>0.0001))errors.push('Enter a non-negative estimated total in PHP.');
  if ([a.employeeName, a.employeeId, a.departmentFunction, a.position, a.emailAddress, a.contactNumber, a.costCenterProjectCode, a.approvingManagerId].some(v => !v.trim())) errors.push('Complete all requestor and cost center fields.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.emailAddress)) errors.push('Enter a valid email address.');
  if (!/^\+?[\d\s().-]+$/.test(a.contactNumber) || a.contactNumber.replace(/\D/g,'').length < 7 || a.contactNumber.replace(/\D/g,'').length > 15) errors.push('Enter a valid contact number with 7–15 digits.');
  if (!/^[A-Za-z0-9][A-Za-z0-9 _/-]{1,49}$/.test(a.costCenterProjectCode.trim())) errors.push('Cost center must contain 2–50 letters, digits, spaces, hyphens, slashes or underscores.');
  if (!b.destinationCountryCity.trim() || !b.departureDate || !b.preferredDepartureTime) errors.push('Complete the destination, departure date and preferred time.');
  if (b.purposeOfTravel === 'Other' && !b.purposeOtherText?.trim()) errors.push('Describe the other purpose of travel.');
  if (!Number.isInteger(b.numberOfTravelers) || b.numberOfTravelers < 1 || b.numberOfTravelers > 50) errors.push('Travelers must be a whole number from 1 to 50.');
  if (b.tripType === 'Round Trip' && (!b.returnDate || b.returnDate < b.departureDate)) errors.push('Return date must be on or after departure.');
  if (b.tripType === 'Round Trip' && !b.preferredReturnTime) errors.push('Preferred return time is required for round trips.');
  if (b.tripType === 'Multi-City' && b.itineraryLegs.length < 2) errors.push('Add at least two multi-city legs.');
  b.itineraryLegs.forEach((leg, i) => { if (!leg.date || !leg.origin || !leg.destination || leg.origin === leg.destination || (i > 0 && leg.date < b.itineraryLegs[i - 1].date)) errors.push(`Check itinerary leg ${i + 1}.`); });
  if (!c.preferredAirline || !Number.isFinite(c.excessBaggageKg) || c.excessBaggageKg < 0 || c.excessBaggageKg > 100) errors.push('Check airline and excess baggage (0–100 kg).');
  if (c.baggageRequirement === 'Additional Baggage' && c.excessBaggageKg <= 0) errors.push('Enter the additional baggage weight.');
  if (!e.businessJustification.trim() || !e.requestedBySignature.trim()) errors.push('Business justification and requestor signature are required.');
  else if (e.businessJustification.trim().length < 10) errors.push('Business justification must contain at least 10 characters.');
  return errors;
}
