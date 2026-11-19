import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';
import 'fake-indexeddb/auto';

const config = JSON.parse(fs.readFileSync('supabase/project.json', 'utf8'));
if (config.name !== 'TeleperformanceTravelManagementSystem' || config.projectRef !== 'pfylcerdvtajgeoxlxvi') throw new Error('Teleperformance project guard failed.');
const token = process.env.SUPABASE_ACCESS_TOKEN || fs.readFileSync('C:/Users/donro/.supabase/access-token', 'utf8').trim();
const base = `https://api.supabase.com/v1/projects/${config.projectRef}`;
async function api(route, method = 'GET', body) {
  const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(`Supabase ${route}: ${response.status} ${JSON.stringify(data).replaceAll(token, '[redacted]')}`);
  return data;
}
async function sql(query) { return api('/database/query', 'POST', { query, read_only: false }); }
function checked(result, label) { if (result.error) throw new Error(label + ': ' + result.error.message); return result.data; }

await sql('create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);');
const applied = new Set((await sql('select version from supabase_migrations.schema_migrations')).map(row => row.version));
for (const filename of fs.readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort()) {
  const version = filename.split('_')[0];
  if (applied.has(version)) continue;
  const source = fs.readFileSync('supabase/migrations/' + filename, 'utf8').replace(/^\s*(?:begin|commit);\s*$/gmi, '');
  await sql(`begin;\n${source}\ninsert into supabase_migrations.schema_migrations(version,name) values('${version}','${filename.slice(version.length + 1, -4)}');\ncommit;`);
  console.log('Applied ' + filename);
}

const keys = await api('/api-keys');
const anon = keys.find(key => key.name === 'anon')?.api_key;
const service = keys.find(key => key.name === 'service_role')?.api_key;
if (!anon || !service) throw new Error('Project API keys are not ready.');
const url = `https://${config.projectRef}.supabase.co`;
fs.writeFileSync('.env.local', `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${anon}\n`);
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { demoUsers, createSeedFlights, makeDraft } = await vite.ssrLoadModule('/src/db/seed.ts');
  fs.mkdirSync('.local', { recursive: true });
  const credentialsFile = '.local/demo-accounts.json';
  const credentials = fs.existsSync(credentialsFile) ? JSON.parse(fs.readFileSync(credentialsFile, 'utf8')) : {};
  const existingUsers = checked(await admin.auth.admin.listUsers({ perPage: 100 }), 'List demo accounts').users;
  const identities = new Map();
  for (const person of demoUsers) {
    const email = person.emailAddress;
    let authUser = existingUsers.find(user => user.email === email);
    if (!authUser) {
      const password = 'TP!' + crypto.randomBytes(15).toString('base64url') + '9a';
      authUser = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: person.employeeName, demo_account: true } }), 'Create demo account').user;
      credentials[person.role === 'REQUESTOR' && person.employeeId !== 'TP-PH-2048' ? person.employeeId : person.role] = { name: person.employeeName, employeeId: person.employeeId, email, password };
      fs.writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2) + '\n');
    }
    identities.set(person.employeeId, { ...person, authId: authUser.id });
  }
  const manager = identities.get('TP-PH-1001');
  for (const person of [...identities.values()].sort((a, b) => Number(b.role === 'MANAGER') - Number(a.role === 'MANAGER'))) {
    checked(await admin.from('profiles').upsert({ id: person.authId, employee_id: person.employeeId, employee_name: person.employeeName, department_function: person.departmentFunction, position: person.position, email_address: person.emailAddress, contact_number: person.contactNumber, cost_center_project_code: person.costCenterProjectCode, role: person.role, approving_manager_id: person.role === 'REQUESTOR' ? manager.authId : null }), 'Provision role profile');
  }
  const clients = {};
  for (const role of ['REQUESTOR', 'ADMIN', 'MANAGER', 'TMC']) {
    clients[role] = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    checked(await clients[role].auth.signInWithPassword({ email: credentials[role].email, password: credentials[role].password }), 'Verify ' + role + ' sign-in');
  }
  const flights = createSeedFlights();
  const storedFlights = checked(await admin.from('flight_schedules').select('id').limit(1), 'Check inventory');
  if (!storedFlights.length) {
    for (const flight of flights) {
      checked(await clients.TMC.rpc('save_travel_schedule', { p_flight: { ...flight, id: crypto.randomUUID() } }), 'Create flight inventory');
    }
  }
  const inventory = checked(await clients.TMC.from('flight_schedules').select('*').order('base_fare'), 'Read inventory');
  const count = checked(await admin.from('travel_requests').select('id').limit(1), 'Check demo requests');
  if (!count.length) {
    for (let index = 0; index < 5; index++) {
      const flight = inventory.find(item => item.origin === 'MNL' && item.destination === ['CEB', 'DVO', 'SIN', 'HKG', 'ILO'][index]);
      const person = identities.get('TP-PH-2048');
      const draft = makeDraft(person);
      draft.tripDetails = { ...draft.tripDetails, destinationCountryCity: flight.destination + ', ' + (flight.travel_type === 'Domestic' ? 'Philippines' : 'Regional client office'), travelType: flight.travel_type, purposeOfTravel: ['Business Meeting', 'Site Visit', 'Training', 'Conference', 'Business Meeting'][index], departureDate: flight.departure_timestamp.slice(0, 10), estimatedTotalPhp: Number(flight.base_fare) + Number(flight.taxes_and_fees), itineraryLegs: [{ origin: flight.origin, destination: flight.destination, date: flight.departure_timestamp.slice(0, 10), preferredFlightId: flight.id }] };
      draft.flightRequirements = { ...draft.flightRequirements, preferredAirline: flight.airline, preferredFlightId: flight.id, preferredFlightCode: flight.flight_number };
      const request = checked(await clients.REQUESTOR.from('travel_requests').insert({ requestor_id: person.authId, approving_manager_id: manager.authId, requestor: draft.requestor, trip_details: draft.tripDetails, flight_requirements: draft.flightRequirements, special_requirements: draft.specialRequirements, business_justification: 'Demo journey for client service delivery planning and operational training.', requested_by_signature: person.employeeName }).select().single(), 'Create demo travel request');
      if (index === 0) continue;
      checked(await clients.ADMIN.rpc('admin_review_travel_request', { p_request_id: request.id, p_approved: true, p_remarks: 'Demo request complete and cost center validated.' }), 'Admin gate');
      if (index === 1) continue;
      checked(await clients.MANAGER.rpc('approve_travel_request', { p_request_id: request.id, p_approved: true, p_signature: manager.employeeName, p_remarks: 'Business purpose and total travel budget approved.', p_authorize_baggage: false, p_budget: draft.tripDetails.estimatedTotalPhp + 2000 }), 'Manager budget gate');
      if (index === 2) continue;
      checked(await clients.TMC.rpc('issue_travel_ticket', { p_request_id: request.id, p_flight_ids: [flight.id], p_fulfillment: { bookingReferencePnr: 'TP' + String(8100 + index), ticketNumber: 'DEMO-TP-' + String(8100 + index), tmcTravelConsultant: credentials.TMC.name } }), 'Demo ticket issuance');
    }
  }
  const primary = ['REQUESTOR', 'ADMIN', 'MANAGER', 'TMC'];
  fs.writeFileSync('.local/DEMO-ACCOUNTS.md', '# Teleperformance demo accounts\n\nThese accounts use the separate Teleperformance Supabase project. Passwords are intentionally excluded from source control and public UI.\n\n| Role | Name | Email | Password |\n| --- | --- | --- | --- |\n' + primary.map(role => `| ${role} | ${credentials[role].name} | ${credentials[role].email} | ${credentials[role].password} |`).join('\n') + '\n');
  const profileCount = await admin.from('profiles').select('id', { count: 'exact', head: true });
  const requests = checked(await clients.TMC.from('travel_requests').select('status'), 'Verify request stages');
  console.log(JSON.stringify({ project: config.projectRef, profiles: profileCount.count, flights: inventory.length, requests: requests.reduce((all, row) => ({ ...all, [row.status]: (all[row.status] || 0) + 1 }), {}), verifiedRoleSignIns: primary }));
} finally { await vite.close(); }
