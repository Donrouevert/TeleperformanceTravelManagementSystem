import { db, type TravelDatabase } from './dexie';
import { dayAfter, today } from '../lib/format';
import { calculateCosts } from '../lib/policy';
import { airlines, emptySpecial, type FlightSchedule, type RequestStatus, type TravelRequest, type User } from '../types/travel';
const profile = (employeeName: string, employeeId: string, departmentFunction: string, role: User['role'], code: string): User => ({ employeeName, employeeId, departmentFunction, role, costCenterProjectCode: code, position: role === 'MANAGER' ? 'Regional Operations Director' : role === 'TMC' ? 'Senior Travel Consultant' : 'Client Services Specialist', emailAddress: `${employeeName.toLowerCase().replaceAll(' ', '.')}@example.com`, contactNumber: '+63 917 555 0142', approvingManagerId: 'TP-PH-1001', approvingManagerName: 'Gabriel Navarro' });
export const demoUsers: User[] = [profile('Alexandra Rivera', 'TP-PH-2048', 'Client Experience', 'REQUESTOR', 'TP-CX-2026'), profile('Gabriel Navarro', 'TP-PH-1001', 'Operations', 'MANAGER', 'OPS-PH-2026'), profile('Rafael Castillo', 'TP-TMC-001', 'Travel Management', 'TMC', 'TMC-PH-2026'), profile('Nico Salazar', 'TP-PH-2081', 'Site Operations', 'REQUESTOR', 'SC-PH-2026'), profile('Alyssa Tan', 'TP-PH-2144', 'Workforce Management', 'REQUESTOR', 'MKT-PH-2026'), profile('Lucas Aquino', 'TP-PH-2207', 'Finance', 'REQUESTOR', 'FIN-PH-2026'), profile('Chloe Ramos', 'TP-PH-2301', 'Human Resources', 'REQUESTOR', 'HR-PH-2026')];
demoUsers.push(profile('Camille Bautista','TP-ADMIN-001','Travel Governance','ADMIN','ADMIN-PH-2026'));
export function makeDraft(user: User = demoUsers[0]): TravelRequest {
  const { role: _role, ...requestor } = user;
  return { id: crypto.randomUUID(), reference: '', status: 'PENDING_APPROVAL', requestor,
    tripDetails: { purposeOfTravel: 'Business Meeting', destinationCountryCity: 'Cebu, Philippines', travelType: 'Domestic', tripType: 'One-Way', originAirport: 'MNL', departureDate: dayAfter(5), preferredDepartureTime: '08:00', numberOfTravelers: 1, itineraryLegs: [{ origin: 'MNL', destination: 'CEB', date: dayAfter(5) }] },
    flightRequirements: { preferredAirline: 'Philippine Airlines', cabinClass: 'Economy', baggageRequirement: 'Standard', excessBaggageKg: 0, seatPreference: 'No Preference', mealRequirement: 'Standard' }, specialRequirements: { ...emptySpecial },
    approval: { businessJustification: '', requestedBySignature: user.employeeName, requestedDate: today(), excessBaggageAuthorized: false }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
export function createSeedFlights(): FlightSchedule[] {
  const routes: [string, string, number, string, number, boolean][] = [ ['CEB','PR 2845',0,'08:10',3850,true], ['CEB','5J 563',1,'10:25',2990,true], ['DVO','PR 2813',0,'09:30',4650,false], ['DVO','5J 975',1,'14:20',3590,true], ['ILO','PR 2141',0,'07:00',3280,true], ['ILO','5J 453',1,'16:40',2490,false], ['SIN','SQ 915',2,'08:00',12850,true], ['SIN','PR 507',0,'10:00',10900,false], ['HKG','CX 906',3,'11:00',9800,true], ['HKG','PR 306',0,'15:00',8890,false], ['NRT','NH 820',4,'09:45',22400,true], ['NRT','PR 428',0,'13:10',19500,false], ['LHR','PR 720',0,'06:00',48900,true], ['CEB','PR 2851',0,'18:00',4190,false] ];
  return routes.flatMap(([destination, flightNumber, carrier, time, baseFare, ecoChoice], i) => [false, true].map((reverse): FlightSchedule => {
    const date = dayAfter(reverse ? 8 : 5), departure = new Date(`${date}T${time}:00+08:00`);
    const hours = destination === 'LHR' ? 15 : destination === 'NRT' ? 4.5 : ['SIN','HKG'].includes(destination) ? 3.5 : 1.5;
    const arrival = new Date(departure.getTime() + hours * 3600000);
    const toLocal = (d: Date) => new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 19) + '+08:00';
    return { id: `FLT-${i + 1}${reverse ? '-R' : ''}`, airline: airlines[carrier], flightNumber: reverse ? `${flightNumber}R` : flightNumber, origin: reverse ? destination : 'MNL', destination: reverse ? 'MNL' : destination, travelType: ['CEB','DVO','ILO'].includes(destination) ? 'Domestic' : 'International', departureTimestamp: toLocal(departure), arrivalTimestamp: toLocal(arrival), seats: { Economy: 120 - i * 4, 'Premium Economy': carrier === 1 ? 0 : 14, Business: carrier === 1 ? 0 : 8 }, capacity: { Economy: 150, 'Premium Economy': carrier === 1 ? 0 : 20, Business: carrier === 1 ? 0 : 12 }, baseFare, taxesAndFees: destination === 'LHR' ? 7200 : baseFare > 8000 ? 1850 : 650, baggageAllowanceKg: carrier === 1 ? 20 : 30, baggageRatePerKg: baseFare > 8000 ? 550 : 250, ecoChoice, co2Kg: Math.round(hours * (ecoChoice ? 38 : 49)), status: i === 3 ? 'DELAYED' : 'SCHEDULED' };
  }));
}
export async function seedDatabase(database: TravelDatabase = db) {
  await database.transaction('rw', database.users, database.flights, database.requests, database.events, async () => {
    if (await database.users.count()) return;
    const flights = createSeedFlights();
    const states: RequestStatus[] = ['PENDING_ADMIN', 'PENDING_APPROVAL', 'APPROVED_FOR_TMC', 'TICKETED', 'TICKETED', 'REBOOKING_REQUESTED', 'REJECTED', 'APPROVED_FOR_TMC', 'TICKETED'];
    const people = [demoUsers[0],demoUsers[3],demoUsers[4],demoUsers[5],demoUsers[0],demoUsers[6],demoUsers[3],demoUsers[0],demoUsers[4]];
    const requests = states.map((status, i): TravelRequest => {
      const r = makeDraft(people[i]), flight = flights[(i * 2) % flights.length];
      r.id = `REQ-${1001 + i}`; r.reference = `TR-${new Date().getFullYear()}-${1001 + i}`; r.status = status;
      r.tripDetails = { ...r.tripDetails, purposeOfTravel: (['Business Meeting','Site Visit','Conference','Training'] as const)[i % 4], destinationCountryCity: `${flight.destination}, ${flight.travelType === 'Domestic' ? 'Philippines' : 'Regional office'}`, travelType: flight.travelType, itineraryLegs: [{ origin: 'MNL', destination: flight.destination, date: dayAfter(5), preferredFlightId: flight.id }] };
      r.flightRequirements = { ...r.flightRequirements, preferredAirline: flight.airline, preferredFlightId: flight.id, preferredFlightCode: flight.flightNumber, excessBaggageKg: [0,8,0,10,5,0,0,4,0][i], baggageRequirement: [1,3,4,7].includes(i) ? 'Additional Baggage' : 'Standard' };
      r.specialRequirements = { ...emptySpecial, visaAssistance: flight.travelType === 'International', groupBooking: i === 1, executiveVipTravel: i === 2, wheelchairMedicalAssistance: i === 7, flightChangeRebookingAssistance: status === 'REBOOKING_REQUESTED' };
      r.approval = { ...r.approval, businessJustification: ['Quarterly client service delivery and account planning review.', 'Contact center operations and service quality site assessment.', 'Regional workforce strategy and leadership capability development.'][i % 3], excessBaggageAuthorized: i === 3, ...(status !== 'PENDING_ADMIN' && status !== 'PENDING_APPROVAL' && status !== 'REJECTED' ? { approvedBySignature: 'Gabriel Navarro', approvedDate: today() } : {}), ...(status === 'REJECTED' ? { managerRemarks: 'Please consolidate with the next regional visit.' } : {}) };
      r.createdAt = new Date(Date.now() - (i + 1) * 3600000 * 6).toISOString();
      if (status === 'TICKETED' || status === 'REBOOKING_REQUESTED') {
        r.tmcFulfillment = { tmcTravelConsultant: 'Rafael Castillo', bookingReferencePnr: `TP${8100+i}`, airline: flight.airline, flightNumber: flight.flightNumber, departureTimestamp: flight.departureTimestamp, arrivalTimestamp: flight.arrivalTimestamp, ticketNumber: `079-${1000000000+i}`, costsPhp: calculateCosts(flight.baseFare, flight.taxesAndFees, r.flightRequirements.excessBaggageKg * flight.baggageRatePerKg, r.flightRequirements.excessBaggageKg, r.approval.excessBaggageAuthorized), bookingDate: today(), paymentStatus: i === 8 ? 'COST_CENTER_CHARGED' : 'UNBILLED', flightIds: [flight.id] };
        flight.seats.Economy -= r.tripDetails.numberOfTravelers;
      }
      return r;
    });
    await database.users.bulkAdd(demoUsers); await database.flights.bulkAdd(flights); await database.requests.bulkAdd(requests);
    await database.events.add({ id: crypto.randomUUID(), message: 'Welcome to TP Travel. Your travel workspace is ready.', timestamp: new Date().toISOString() });
  });
}
