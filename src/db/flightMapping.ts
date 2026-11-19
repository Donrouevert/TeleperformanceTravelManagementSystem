import { cabins, type FlightSchedule } from '../types/travel';
import { manilaDateTime, normalizeCabin, normalizeIata } from '../lib/flights';

type DatabaseFlight = Record<string, any>;
export function mapCloudFlight(row: DatabaseFlight): FlightSchedule {
  const departure = manilaDateTime(row.departure_timestamp), arrival = manilaDateTime(row.arrival_timestamp);
  if (!departure || !arrival) throw new Error(`Invalid schedule timestamps for ${row.flight_number || row.id}.`);
  const joined = Array.isArray(row.flight_cabins) ? row.flight_cabins : [];
  const inventory = (field: 'available_seats' | 'capacity') => Object.fromEntries(cabins.map(cabin => {
    const record = joined.find((item: DatabaseFlight) => normalizeCabin(String(item.cabin_class ?? '')) === cabin);
    const count = Number(record?.[field] ?? 0);
    return [cabin, Number.isInteger(count) && count >= 0 ? count : 0];
  })) as FlightSchedule['seats'];
  return {
    fareSeenAt: row.updated_at || row.created_at || undefined, id: row.id, airline: row.airline, flightNumber: row.flight_number,
    origin: normalizeIata(row.origin), destination: normalizeIata(row.destination), travelType: row.travel_type,
    departureTimestamp: departure.timestamp, arrivalTimestamp: arrival.timestamp,
    baseFare: Number(row.base_fare), taxesAndFees: Number(row.taxes_and_fees),
    baggageAllowanceKg: Number(row.baggage_allowance_kg), baggageRatePerKg: Number(row.baggage_rate_per_kg),
    ecoChoice: row.eco_choice === true, co2Kg: Number(row.co2_kg), status: row.status,
    seats: inventory('available_seats'), capacity: inventory('capacity'),
  };
}
