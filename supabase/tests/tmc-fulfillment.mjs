process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
// Runs only in an isolated in-memory PostgreSQL instance; never connects to Supabase.
const {PGlite}=await import(process.env.PGLITE_TEST_MODULE??'@electric-sql/pglite');
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
const dir=new URL('../migrations/',import.meta.url);
for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())await db.exec(fs.readFileSync(new URL(name,dir),'utf8'));

const ids={employee:'00000000-0000-4000-8000-000000000001',manager:'00000000-0000-4000-8000-000000000002',admin:'00000000-0000-4000-8000-000000000003',tmc:'00000000-0000-4000-8000-000000000004'};
for(const [role,id] of Object.entries(ids)){await db.query('insert into auth.users values($1)',[id]);await db.query("insert into profiles(id,employee_id,employee_name,department_function,position,email_address,cost_center_project_code,role) values($1,$2,$2,'Operations','Staff','test@example.com','TEST-01',$3)",[id,role,role==='employee'?'REQUESTOR':role.toUpperCase()]);}
await db.query('update profiles set approving_manager_id=$1 where id=$2',[ids.manager,ids.employee]);
const flights=['00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000011'];
for(let i=0;i<2;i++){await db.query("insert into flight_schedules(id,airline,flight_number,origin,destination,travel_type,departure_timestamp,arrival_timestamp,base_fare,taxes_and_fees,baggage_allowance_kg,baggage_rate_per_kg) values($1,'Philippine Airlines',$2,$3,$4,'Domestic',$5,$6,3000,500,20,250)",[flights[i],'DEMO'+i,i?'CEB':'MNL',i?'MNL':'CEB',i?'2040-01-03 08:00+08':'2040-01-01 08:00+08',i?'2040-01-03 09:30+08':'2040-01-01 09:30+08']);await db.query("insert into flight_cabins values($1,'Economy',1000,1000)",[flights[i]]);}
const as=async(role)=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[role]]);};
async function request({excess=0,travelers=1,roundtrip=false,approved=true,authorized=false}={}){
 await as('employee');const result=await db.query(`insert into travel_requests(requestor_id,approving_manager_id,requestor,trip_details,flight_requirements,business_justification,requested_by_signature) values($1,$2,$3,$4,$5,'Quarterly customer planning','Employee') returning id`,[ids.employee,ids.manager,{departmentFunction:'Operations',position:'Staff',costCenterProjectCode:'TEST-01',contactNumber:'+63 917 555 0142'},{travelType:'Domestic',tripType:roundtrip?'Round Trip':'One-Way',purposeOfTravel:'Business Meeting',numberOfTravelers:travelers,itineraryLegs:[{origin:'MNL',destination:'CEB',date:'2040-01-01'},...(roundtrip?[{origin:'CEB',destination:'MNL',date:'2040-01-03'}]:[])],departureDate:'2040-01-01',preferredDepartureTime:'08:00',returnDate:roundtrip?'2040-01-03':undefined,preferredReturnTime:roundtrip?'08:00':undefined,destinationCountryCity:'Cebu'},{cabinClass:'Economy',excessBaggageKg:excess,baggageRequirement:excess?'Additional Baggage':'Standard'}]);const id=result.rows[0].id;
 if(approved){await as('admin');await db.query("select admin_review_travel_request($1,true,'Intake checked')",[id]);await as('manager');await db.query("select approve_travel_request($1,true,'Manager','Approved',$2,150000)",[id,authorized]);}await as('tmc');return id;
}
const seats=async()=>Number((await db.query('select available_seats from flight_cabins where flight_id=$1',[flights[0]])).rows[0].available_seats);
const issue=async(id,manual={},legs=[flights[0]])=>(await db.query('select * from issue_travel_ticket($1,$2::uuid[],$3::jsonb)',[id,legs,JSON.stringify(manual)])).rows[0];
let assertions=0;
let id=await request({excess:5,travelers:3,roundtrip:true});let b=await issue(id,{baseFare:20000.50,taxesAndFees:1500.25,baggageFee:400.25,bookingReferencePnr:'ABC123',ticketNumber:'079-123',tmcTravelConsultant:'Daniel'},flights);assert.equal(Number(b.total_cost),21901);assert.equal(Number(b.employee_payable_excess_fee),400.25);assert.equal(Number(b.company_billable_total),21500.75);assert.equal(b.tmc_consultant_id,ids.tmc);assert.equal(b.tmc_travel_consultant,'Daniel');assertions++;
id=await request();await db.query('select issue_travel_ticket($1,$2::uuid[])',[id,[flights[0]]]);b=(await db.query('select * from bookings where request_id=$1',[id])).rows[0];assert.equal(Number(b.total_cost),3500);assert.match(b.booking_reference_pnr,/^[A-Z0-9]{6}$/);assertions++;
id=await request();b=await issue(id,{baseFare:0,taxesAndFees:0});assert.equal(Number(b.total_cost),0);assertions++;
id=await request({excess:5,authorized:true});b=await issue(id,{baggageFee:99.50});assert.equal(Number(b.employee_payable_excess_fee),0);assert.equal(Number(b.company_billable_total),3599.50);assertions++;
const invalid=[{baseFare:-1},{baseFare:1.001},{baseFare:'NaN'},{baseFare:10000000000},{baseFare:9999999999.99,taxesAndFees:1},{baggageFee:1},{bookingReferencePnr:'BAD'},{ticketNumber:'BAD SPACE'},{tmcTravelConsultant:''},{tmcTravelConsultant:'x'.repeat(121)},{tmcConsultantId:ids.manager},[]];
for(const manual of invalid){id=await request();const before=await seats();await assert.rejects(()=>issue(id,manual));assert.equal(await seats(),before);assert.equal((await db.query('select status from travel_requests where id=$1',[id])).rows[0].status,'APPROVED_FOR_TMC');assertions++;}
for(const manual of [{bookingReferencePnr:'ABC123'},{ticketNumber:'079-123'}]){id=await request();const before=await seats();await assert.rejects(()=>issue(id,manual),/already exists/);assert.equal(await seats(),before);assertions++;}
id=await request({approved:false});await assert.rejects(()=>issue(id,{baseFare:100}),/Manager approval/);assertions++;
id=await request();for(const role of ['employee','manager','admin']){await as(role);await assert.rejects(()=>issue(id,{baseFare:100}),/TMC role/);assertions++;}
await db.exec('reset role;set role anon');await assert.rejects(()=>issue(id),/permission denied/);assertions++;
await as('tmc');id=await request({roundtrip:true});await db.exec('reset role');await db.query('update flight_cabins set available_seats=0 where flight_id=$1',[flights[1]]);await as('tmc');const before=await seats();await assert.rejects(()=>issue(id,{baseFare:500},flights),/Insufficient cabin seats/);assert.equal(await seats(),before);assertions++;
console.log('Passed '+assertions+' SQL scenarios: TMC manual totals/references, legacy defaults, split billing, role and approval gates, invalid inputs, duplicates and atomic rollback.');await db.close();
