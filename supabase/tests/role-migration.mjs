process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
// Runs only in an isolated in-memory PostgreSQL instance; never connects to Supabase.
const {PGlite}=await import(process.env.PGLITE_TEST_MODULE??'@electric-sql/pglite');
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
const dir=new URL('../migrations/',import.meta.url);
for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.sql')&&!n.startsWith('202611180001')).sort())await db.exec(fs.readFileSync(new URL(name,dir),'utf8'));

const ids={employee:'00000000-0000-4000-8000-000000000001',manager:'00000000-0000-4000-8000-000000000002',admin:'00000000-0000-4000-8000-000000000003',tmc:'00000000-0000-4000-8000-000000000004'};
for(const [role,id] of Object.entries(ids)){await db.query('insert into auth.users values($1)',[id]);await db.query("insert into profiles(id,employee_id,employee_name,department_function,position,email_address,cost_center_project_code,role) values($1,$2,$2,'Operations','Staff','test@example.com','TEST-01',$3)",[id,role,role==='employee'?'REQUESTOR':role.toUpperCase()]);}
await db.query('update profiles set approving_manager_id=$1 where id=$2',[ids.manager,ids.employee]);
const flights=['00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000011'];
for(let i=0;i<2;i++){await db.query("insert into flight_schedules(id,airline,flight_number,origin,destination,travel_type,departure_timestamp,arrival_timestamp,base_fare,taxes_and_fees,baggage_allowance_kg,baggage_rate_per_kg) values($1,'Philippine Airlines',$2,$3,$4,'Domestic',$5,$6,3000,500,20,250)",[flights[i],'DEMO'+i,i?'CEB':'MNL',i?'MNL':'CEB',i?'2040-01-03 08:00+08':'2040-01-01 08:00+08',i?'2040-01-03 09:30+08':'2040-01-01 09:30+08']);await db.query("insert into flight_cabins values($1,'Economy',1000,1000)",[flights[i]]);}
const as=async(role)=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[role]]);};
async function request({excess=0,travelers=1,roundtrip=false,approved=true,authorized=false}={}){
 await as('employee');const result=await db.query(`insert into travel_requests(requestor_id,approving_manager_id,requestor,trip_details,flight_requirements,business_justification,requested_by_signature) values($1,$2,$3,$4,$5,'Quarterly customer planning','Employee') returning id`,[ids.employee,ids.manager,{departmentFunction:'Operations',position:'Staff',costCenterProjectCode:'TEST-01',contactNumber:'+63 917 555 0142'},{travelType:'Domestic',tripType:roundtrip?'Round Trip':'One-Way',purposeOfTravel:'Business Meeting',numberOfTravelers:travelers,itineraryLegs:[{origin:'MNL',destination:'CEB',date:'2040-01-01'},...(roundtrip?[{origin:'CEB',destination:'MNL',date:'2040-01-03'}]:[])],departureDate:'2040-01-01',preferredDepartureTime:'08:00',returnDate:roundtrip?'2040-01-03':undefined,preferredReturnTime:roundtrip?'08:00':undefined,destinationCountryCity:'Cebu'},{cabinClass:'Economy',excessBaggageKg:excess,baggageRequirement:excess?'Additional Baggage':'Standard'}]);const id=result.rows[0].id;
 if(approved){await as('admin');await db.query("select admin_review_travel_request($1,true,'Intake checked')",[id]);await as('manager');await db.query("select approve_travel_request($1,true,'Manager','Approved',$2)",[id,authorized]);}await as('tmc');return id;
}
const seats=async()=>Number((await db.query('select available_seats from flight_cabins where flight_id=$1',[flights[0]])).rows[0].available_seats);
const issue=async(id,manual={},legs=[flights[0]])=>(await db.query('select * from issue_travel_ticket($1,$2::uuid[],$3::jsonb)',[id,legs,JSON.stringify(manual)])).rows[0];
const ticketed=await request();const issued=await issue(ticketed);await db.query('select settle_travel_booking($1)',[issued.id]);const pending=await request();const before=(await db.query('select * from bookings where id=$1',[issued.id])).rows[0];
await db.exec('reset role');await db.exec(fs.readFileSync(new URL('202611180001_role_workflows.sql',dir),'utf8'));
const after=(await db.query('select * from bookings where id=$1',[issued.id])).rows[0];assert.equal(after.ticket_number,before.ticket_number);assert.equal(after.booking_reference_pnr,before.booking_reference_pnr);assert.equal(after.payment_status,before.payment_status);assert.equal(Number(after.total_cost),Number(before.total_cost));assert.equal(Number(after.settled_company_php),3500);
const review=(await db.query('select * from travel_requests where id=$1',[pending])).rows[0];assert.equal(review.status,'PENDING_APPROVAL');assert.equal(review.approved_by,null);assert.equal(review.approved_budget,null);
const archived=(await db.query("select snapshot from request_revisions where request_id=$1 and kind='BUDGET_REVIEW_REQUIRED'",[pending])).rows[0];assert.equal(archived.snapshot.status,'APPROVED_FOR_TMC');assert.equal(archived.snapshot.approved_by,ids.manager);
const opening=(await db.query("select * from billing_adjustments where booking_id=$1 and kind='OPENING_BALANCE'",[issued.id])).rows[0];assert.equal(Number(opening.company_php),3500);assert.equal(Number(opening.employee_php),0);
console.log('Migration backfill checks passed: existing ticket/reference/fare/settlement preserved; paid balance opened once; unticketed approval archived and returned for budget review.');await db.close();
