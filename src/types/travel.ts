export type Role = 'REQUESTOR' | 'MANAGER' | 'TMC' | 'ADMIN';
export type RequestStatus = 'PENDING_ADMIN' | 'PENDING_APPROVAL' | 'APPROVED_FOR_TMC' | 'TICKETED' | 'REBOOKING_REQUESTED' | 'REJECTED' | 'CHANGES_REQUESTED';
export type CabinClass = 'Economy' | 'Premium Economy' | 'Business';
export type Purpose = 'Business Meeting' | 'Conference' | 'Training' | 'Site Visit' | 'Other';
export interface Requestor {
  employeeName: string; employeeId: string; departmentFunction: string; position: string;
  emailAddress: string; contactNumber: string; costCenterProjectCode: string;
  approvingManagerId: string; approvingManagerName: string;
}
export interface User extends Requestor { role: Role; authId?: string; }
export interface ItineraryLeg { origin: string; destination: string; date: string; preferredFlightId?: string; }
export interface TripDetails {
  estimatedTotalPhp?: number; purposeOfTravel: Purpose; purposeOtherText?: string; destinationCountryCity: string;
  travelType: 'Domestic' | 'International'; tripType: 'One-Way' | 'Round Trip' | 'Multi-City';
  departureDate: string; preferredDepartureTime: string; returnDate?: string; preferredReturnTime?: string;
  numberOfTravelers: number; originAirport: string; itineraryLegs: ItineraryLeg[];
}
export interface FlightRequirements {
  preferredAirline: string; cabinClass: CabinClass; preferredFlightId?: string; preferredFlightCode?: string;
  baggageRequirement: 'Standard' | 'Additional Baggage'; excessBaggageKg: number;
  seatPreference: 'Window' | 'Aisle' | 'No Preference'; mealRequirement: string; frequentFlyerNo?: string;
}
export interface SpecialRequirements {
  flexibleTicket: boolean; multipleDestinations: boolean; groupBooking: boolean; executiveVipTravel: boolean;
  specialBaggageEquipment: boolean; visaAssistance: boolean; wheelchairMedicalAssistance: boolean;
  flightChangeRebookingAssistance: boolean; otherText?: string;
}
export interface Approval {
  businessJustification: string; requestedBySignature: string; requestedDate: string;
  approvedBySignature?: string; approvedDate?: string; excessBaggageAuthorized: boolean; managerRemarks?: string;
}
export interface CostsPhp {
  baseFare: number; taxesAndFees: number; baggageFee: number; totalCost: number;
  employeePayableExcessFee: number; companyBillableTotal: number;
}
export interface TmcFulfillment {
  reservedCabin?:CabinClass; reservedTravelers?:number;
  tmcTravelConsultant: string; bookingReferencePnr: string; airline: string; flightNumber: string;
  departureTimestamp: string; arrivalTimestamp: string; ticketNumber: string; costsPhp: CostsPhp;
  bookingDate: string; paymentStatus: 'UNBILLED' | 'COST_CENTER_CHARGED' | 'SPLIT_SETTLED'; flightIds: string[];
}
export interface TravelRequest {
  historyRecords?:Array<{id:string;kind:string;note:string;created_at:string;snapshot:Record<string,any>}>;
  approvedBudgetPhp?:number; correctionNote?:string; revision?:number; isRebooking?:boolean;
  tmcQuote?:{flightIds:string[];fulfillment:Partial<TmcFulfillment>&{baseFare?:number;taxesAndFees?:number;baggageFee?:number};total:number;company:number;employee:number;revision:number};
  settledCompanyPhp?:number; settledEmployeePhp?:number;

  adminReview?: {approved: boolean; reviewer: string; date: string; remarks: string}; id: string; reference: string; status: RequestStatus; requestor: Requestor; tripDetails: TripDetails;
  flightRequirements: FlightRequirements; specialRequirements: SpecialRequirements; approval: Approval;
  tmcFulfillment?: TmcFulfillment; createdAt: string; updatedAt: string;
}
export interface FlightSchedule {
  id: string; airline: string; flightNumber: string; origin: string; destination: string; fareSeenAt?: string;
  travelType: 'Domestic' | 'International'; departureTimestamp: string; arrivalTimestamp: string;
  seats: Record<CabinClass, number>; capacity: Record<CabinClass, number>;
  baseFare: number; taxesAndFees: number; baggageAllowanceKg: number; baggageRatePerKg: number;
  ecoChoice: boolean; co2Kg: number; status: 'SCHEDULED' | 'DELAYED' | 'CANCELLED';
}
export interface TravelEvent { id: string; message: string; requestId?: string; timestamp: string; }
export const cabins: CabinClass[] = ['Economy', 'Premium Economy', 'Business'];
export const purposes: Purpose[] = ['Business Meeting', 'Conference', 'Training', 'Site Visit', 'Other'];
export const airlines = ['Philippine Airlines', 'Cebu Pacific', 'Singapore Airlines', 'Cathay Pacific', 'ANA'];
export const airports: Record<string, string> = { MNL: 'Manila', CEB: 'Cebu', DVO: 'Davao', ILO: 'Iloilo', SIN: 'Singapore', HKG: 'Hong Kong', NRT: 'Tokyo', LHR: 'London', DRP: 'Legazpi (Daraga)', MPH: 'Boracay (Caticlan)', CGK: 'Jakarta', BKK: 'Bangkok', AMS: 'Rotterdam / Amsterdam', ZRH: 'Zurich', EWR: 'New York / Englewood Cliffs', YYZ: 'Toronto', GRU: 'São Paulo', DXB: 'Dubai', JNB: 'Johannesburg', NBO: 'Nairobi' };
export const specialLabels: Record<keyof Omit<SpecialRequirements, 'otherText'>, string> = {
  flexibleTicket: 'Flexible ticket', multipleDestinations: 'Multiple destinations', groupBooking: 'Group booking',
  executiveVipTravel: 'Executive / VIP travel', specialBaggageEquipment: 'Special baggage / equipment',
  visaAssistance: 'Visa assistance', wheelchairMedicalAssistance: 'Wheelchair / medical assistance',
  flightChangeRebookingAssistance: 'Flight change / rebooking assistance',
};
export const emptySpecial: SpecialRequirements = { flexibleTicket: false, multipleDestinations: false, groupBooking: false, executiveVipTravel: false, specialBaggageEquipment: false, visaAssistance: false, wheelchairMedicalAssistance: false, flightChangeRebookingAssistance: false };
