import Dexie, { type Table } from 'dexie';
import type { FlightSchedule, TravelEvent, TravelRequest, User } from '../types/travel';
export class TravelDatabase extends Dexie {
  users!: Table<User, string>; requests!: Table<TravelRequest, string>; flights!: Table<FlightSchedule, string>; events!: Table<TravelEvent, string>;
  constructor(name = 'teleperformance-travel-v1') {
    super(name);
    this.version(1).stores({ users: 'employeeId,role', requests: 'id,status,requestor.employeeId,createdAt', flights: 'id,origin,destination,airline', events: 'id,timestamp' });
  }
}
export const db = new TravelDatabase();
