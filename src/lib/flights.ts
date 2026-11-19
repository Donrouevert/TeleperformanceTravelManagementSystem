import { cabins, type CabinClass, type FlightSchedule } from '../types/travel';

export type FlightSort = 'lowest_fare' | 'earliest_departure' | 'shortest_duration' | 'lowest_co2';
export interface FlightFilters {
  origin?: string; destination?: string; date?: string; travelType?: string; airline?: string;
  cabinClass?: string; ecoOnly?: boolean; maxFarePerTraveler?: number; maxPrice?: number;
  minBaggage?: number; travelers?: number; timeFrom?: string; timeTo?: string; sortBy?: FlightSort;
}
export const cabinMultiplier: Record<CabinClass, number> = { Economy: 1, 'Premium Economy': 1.65, Business: 2.8 };
const manilaClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function normalizeIata(value: string): string {
  return value.trim().toUpperCase().match(/^([A-Z]{3})(?:$|[\s·(–-])/)?.[1] ?? '';
}
export function normalizeCabin(value: string): CabinClass | undefined {
  const normalized = value.trim().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  return cabins.find(cabin => cabin.toLowerCase() === normalized);
}
/** Use an instant's Philippine date and time, regardless of browser/UTC timezone. */
export function manilaDateTime(value: string): {date: string; time: string; timestamp: string} | null {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return null;
  const parts = Object.fromEntries(manilaClock.formatToParts(instant).map(part => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  return {date, time, timestamp: `${date}T${time}:${parts.second}+08:00`};
}
export function seatsForCabin(flight: FlightSchedule, cabin: string = 'Economy'): number {
  const canonical = normalizeCabin(cabin);
  const seats = Object.entries(flight.seats).find(([key]) => normalizeCabin(key) === canonical)?.[1];
  return canonical && Number.isFinite(Number(seats)) ? Number(seats) : 0;
}
/** Matches server ticket pricing: cabin-adjusted base fare plus taxes, per traveler. */
export function farePerTraveler(flight: FlightSchedule, cabin: string = 'Economy'): number {
  return fareForTravelers(flight, cabin, 1);
}
/** Round the cabin-adjusted group base once, exactly as the ticketing RPC does. */
export function fareForTravelers(flight: FlightSchedule, cabin: string, travelers: number): number {
  const canonical = normalizeCabin(cabin);
  if (!canonical) return NaN;
  const base = Math.round((Number(flight.baseFare) * cabinMultiplier[canonical] * travelers + Number.EPSILON) * 100) / 100;
  return Math.round((base + Number(flight.taxesAndFees) * travelers + Number.EPSILON) * 100) / 100;
}
export const flightDuration = (flight: FlightSchedule) => Date.parse(flight.arrivalTimestamp) - Date.parse(flight.departureTimestamp);

export function filterFlights(flights: FlightSchedule[], filters: FlightFilters): FlightSchedule[] {
  const cabin = normalizeCabin(filters.cabinClass ?? 'Economy');
  const travelers = filters.travelers ?? 1;
  const origin = filters.origin ? normalizeIata(filters.origin) : '';
  const destination = filters.destination ? normalizeIata(filters.destination) : '';
  const from = filters.timeFrom?.trim() ?? '', until = filters.timeTo?.trim() ?? '';
  const isTime = (time: string) => !time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const maximum = filters.maxFarePerTraveler ?? filters.maxPrice;
  if (!cabin || !Number.isInteger(travelers) || travelers < 1 || travelers > 50
    || (filters.origin && !origin) || (filters.destination && !destination)
    || !isTime(from) || !isTime(until) || (from && until && from > until)
    || (maximum !== undefined && (!Number.isFinite(maximum) || maximum < 0))) return [];

  return flights.filter(flight => {
    const departure = manilaDateTime(flight.departureTimestamp);
    const fare = farePerTraveler(flight, cabin);
    const duration = flightDuration(flight);
    if (!departure || !Number.isFinite(fare) || !Number.isFinite(duration) || duration <= 0) return false;
    return flight.status.toUpperCase() !== 'CANCELLED'
      && (!origin || normalizeIata(flight.origin) === origin)
      && (!destination || normalizeIata(flight.destination) === destination)
      && (!filters.date || departure.date === filters.date)
      && (!filters.travelType || flight.travelType.toLowerCase() === filters.travelType.toLowerCase())
      && (!filters.airline || flight.airline === filters.airline)
      && (!filters.ecoOnly || flight.ecoChoice)
      && seatsForCabin(flight, cabin) >= travelers
      && (maximum === undefined || fare <= maximum)
      && (filters.minBaggage === undefined || flight.baggageAllowanceKg >= filters.minBaggage)
      && (!from || departure.time >= from) && (!until || departure.time <= until);
  }).sort((a, b) => {
    const departure = Date.parse(a.departureTimestamp) - Date.parse(b.departureTimestamp);
    const fare = farePerTraveler(a, cabin) - farePerTraveler(b, cabin);
    const primary = filters.sortBy === 'earliest_departure' ? departure
      : filters.sortBy === 'shortest_duration' ? flightDuration(a) - flightDuration(b)
      : filters.sortBy === 'lowest_co2' ? a.co2Kg - b.co2Kg : fare;
    return primary || fare || departure || a.id.localeCompare(b.id);
  });
}

export function availableFlightDates(flights: FlightSchedule[], filters: FlightFilters, earliest = ''): string[] {
  return [...new Set(filterFlights(flights, {...filters, date: undefined}).map(flight => manilaDateTime(flight.departureTimestamp)!.date))]
    .filter(date => date >= earliest).sort();
}
