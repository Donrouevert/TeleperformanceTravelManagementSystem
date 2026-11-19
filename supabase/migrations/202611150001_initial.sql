-- TP Travel: Supabase schema, version 1.
-- Run ONCE in a new Supabase project's SQL Editor as postgres.
-- Transactional: an error rolls back this migration. No existing tables are dropped.
-- App integration is a separate step; this does not move IndexedDB records.
begin;

create schema if not exists travel_private;
revoke all on schema travel_private from public, anon;
grant usage on schema travel_private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  employee_id text not null unique,
  employee_name text not null check (length(trim(employee_name)) > 0),
  department_function text not null,
  position text not null,
  email_address text not null,
  contact_number text not null default '',
  cost_center_project_code text not null,
  role text not null default 'REQUESTOR' check (role in ('REQUESTOR','MANAGER','TMC')),
  approving_manager_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index profiles_manager_idx on public.profiles(approving_manager_id);

-- A-D retain the React form's camelCase JSON property names.
-- E is stored in protected columns; never trust browser-provided approval flags.
create table public.travel_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('TR-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  requestor_id uuid not null default auth.uid() references public.profiles(id),
  approving_manager_id uuid not null references public.profiles(id),
  requestor jsonb not null check (jsonb_typeof(requestor) = 'object'),
  trip_details jsonb not null check (jsonb_typeof(trip_details) = 'object'),
  flight_requirements jsonb not null check (jsonb_typeof(flight_requirements) = 'object'),
  special_requirements jsonb not null default '{}'::jsonb check (jsonb_typeof(special_requirements) = 'object'),
  status text not null default 'PENDING_APPROVAL' check (status in ('PENDING_APPROVAL','APPROVED_FOR_TMC','TICKETED','REBOOKING_REQUESTED','REJECTED')),
  business_justification text not null check (length(trim(business_justification)) >= 10),
  requested_by_signature text not null check (length(trim(requested_by_signature)) > 0),
  requested_date date not null default (now() at time zone 'Asia/Manila')::date,
  approved_by uuid references public.profiles(id),
  approved_by_signature text,
  approved_date date,
  excess_baggage_authorized boolean not null default false,
  manager_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requestor_id <> approving_manager_id),
  check ((trip_details->>'travelType') in ('Domestic','International')),
  check ((trip_details->>'tripType') in ('One-Way','Round Trip','Multi-City')),
  check ((trip_details->>'purposeOfTravel') in ('Business Meeting','Conference','Training','Site Visit','Other')),
  check ((trip_details->>'numberOfTravelers')::integer between 1 and 50),
  check (jsonb_typeof(trip_details->'itineraryLegs') = 'array'),
  check (jsonb_array_length(trip_details->'itineraryLegs') between 1 and 4),
  check ((flight_requirements->>'cabinClass') in ('Economy','Premium Economy','Business')),
  check ((flight_requirements->>'excessBaggageKg')::numeric between 0 and 100),
  check (trip_details ?& array['travelType','tripType','purposeOfTravel','numberOfTravelers','itineraryLegs','departureDate']),
  check (flight_requirements ?& array['cabinClass','excessBaggageKg'])
);
create index requests_requestor_idx on public.travel_requests(requestor_id);
create index requests_manager_idx on public.travel_requests(approving_manager_id);
create index requests_status_created_idx on public.travel_requests(status,created_at desc);

create table public.flight_schedules (
  id uuid primary key default gen_random_uuid(),
  airline text not null,
  flight_number text not null,
  origin text not null check (origin in ('MNL','CEB','DVO','ILO','SIN','HKG','NRT','LHR')),
  destination text not null check (destination in ('MNL','CEB','DVO','ILO','SIN','HKG','NRT','LHR')),
  travel_type text not null check (travel_type in ('Domestic','International')),
  departure_timestamp timestamptz not null,
  arrival_timestamp timestamptz not null,
  base_fare numeric(12,2) not null check (base_fare >= 0),
  taxes_and_fees numeric(12,2) not null default 0 check (taxes_and_fees >= 0),
  baggage_allowance_kg numeric(6,2) not null default 20 check (baggage_allowance_kg >= 0),
  baggage_rate_per_kg numeric(10,2) not null default 250 check (baggage_rate_per_kg >= 0),
  eco_choice boolean not null default false,
  co2_kg numeric(10,2) not null default 0 check (co2_kg >= 0),
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','DELAYED','CANCELLED')),
  check (origin <> destination),
  check (arrival_timestamp > departure_timestamp),
  unique(airline,flight_number,departure_timestamp)
);
create index flight_route_date_idx on public.flight_schedules(origin,destination,departure_timestamp);

create table public.flight_cabins (
  flight_id uuid not null references public.flight_schedules(id) on delete cascade,
  cabin_class text not null check (cabin_class in ('Economy','Premium Economy','Business')),
  capacity integer not null check (capacity >= 0),
  available_seats integer not null check (available_seats >= 0 and available_seats <= capacity),
  primary key(flight_id,cabin_class)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.travel_requests(id),
  tmc_consultant_id uuid not null references public.profiles(id),
  tmc_travel_consultant text not null,
  booking_reference_pnr text not null unique check (booking_reference_pnr ~ '^[A-Z0-9]{6}$'),
  airline text not null,
  flight_number text not null,
  departure_timestamp timestamptz not null,
  arrival_timestamp timestamptz not null,
  ticket_number text not null unique,
  base_fare numeric(12,2) not null check (base_fare >= 0),
  taxes_and_fees numeric(12,2) not null check (taxes_and_fees >= 0),
  baggage_fee numeric(12,2) not null check (baggage_fee >= 0),
  -- Snapshot of the protected manager decision, written only by issue_ticket().
  excess_baggage_authorized boolean not null,
  total_cost numeric(12,2) generated always as (base_fare + taxes_and_fees + baggage_fee) stored,
  employee_payable_excess_fee numeric(12,2) generated always as (case when excess_baggage_authorized then 0 else baggage_fee end) stored,
  company_billable_total numeric(12,2) generated always as (base_fare + taxes_and_fees + case when excess_baggage_authorized then baggage_fee else 0 end) stored,
  booking_date date not null default (now() at time zone 'Asia/Manila')::date,
  payment_status text not null default 'UNBILLED' check (payment_status in ('UNBILLED','COST_CENTER_CHARGED','SPLIT_SETTLED')),
  settled_at timestamptz,
  settled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (arrival_timestamp > departure_timestamp)
);
create index bookings_consultant_idx on public.bookings(tmc_consultant_id);

create table public.booking_legs (
  booking_id uuid not null references public.bookings(id) on delete restrict,
  leg_number integer not null check (leg_number between 1 and 4),
  flight_id uuid not null,
  cabin_class text not null,
  travelers integer not null check (travelers between 1 and 50),
  primary key(booking_id,leg_number),
  unique(booking_id,flight_id),
  foreign key(flight_id,cabin_class) references public.flight_cabins(flight_id,cabin_class)
);
create index booking_legs_flight_idx on public.booking_legs(flight_id);

create table public.travel_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.travel_requests(id),
  actor_id uuid references public.profiles(id),
  message text not null,
  created_at timestamptz not null default now()
);
create index events_request_idx on public.travel_events(request_id,created_at desc);

-- Protected role lookup avoids recursive profiles RLS. Users cannot edit roles.
create function travel_private.current_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid())
$$;
revoke all on function travel_private.current_role() from public, anon, authenticated;
grant execute on function travel_private.current_role() to authenticated;

alter table public.profiles enable row level security;
alter table public.travel_requests enable row level security;
alter table public.flight_schedules enable row level security;
alter table public.flight_cabins enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_legs enable row level security;
alter table public.travel_events enable row level security;

revoke all on public.profiles, public.travel_requests, public.flight_schedules,
  public.flight_cabins, public.bookings, public.booking_legs, public.travel_events
  from anon, authenticated;
grant select on public.profiles, public.travel_requests, public.flight_schedules,
  public.flight_cabins, public.bookings, public.booking_legs, public.travel_events to authenticated;
grant insert(requestor_id,approving_manager_id,requestor,trip_details,flight_requirements,
  special_requirements,business_justification,requested_by_signature)
  on public.travel_requests to authenticated;
-- Status, approval, seats, billing and audit writes are deliberately RPC-only.

create policy profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or role = 'MANAGER' or travel_private.current_role() = 'TMC'
       or approving_manager_id = (select auth.uid()));
create policy requests_read on public.travel_requests for select to authenticated
using (requestor_id = (select auth.uid()) or approving_manager_id = (select auth.uid())
       or travel_private.current_role() = 'TMC');
create policy requests_submit on public.travel_requests for insert to authenticated
with check (requestor_id = (select auth.uid()) and travel_private.current_role() = 'REQUESTOR'
  and status = 'PENDING_APPROVAL' and approved_by is null and not excess_baggage_authorized
  and exists(select 1 from public.profiles p where p.id = (select auth.uid())
    and p.approving_manager_id = travel_requests.approving_manager_id
    and p.employee_id = travel_requests.requestor->>'employeeId')
  and exists(select 1 from public.profiles m where m.id = travel_requests.approving_manager_id and m.role = 'MANAGER')
  and (trip_details->>'departureDate')::date >= (now() at time zone 'Asia/Manila')::date);
create policy flights_read on public.flight_schedules for select to authenticated using (travel_private.current_role() is not null);
create policy cabins_read on public.flight_cabins for select to authenticated using (travel_private.current_role() is not null);
create policy bookings_read on public.bookings for select to authenticated
using (exists(select 1 from public.travel_requests r where r.id = request_id));
create policy legs_read on public.booking_legs for select to authenticated
using (exists(select 1 from public.bookings b where b.id = booking_id));
create policy events_read on public.travel_events for select to authenticated
using (exists(select 1 from public.travel_requests r where r.id = request_id)
  or (request_id is null and travel_private.current_role() = 'TMC'));

create function public.approve_travel_request(p_request_id uuid,p_approved boolean,
  p_signature text,p_remarks text default '',p_authorize_baggage boolean default false)
returns public.travel_requests language plpgsql security definer set search_path = '' as $$
declare r public.travel_requests;
begin
  if travel_private.current_role() is distinct from 'MANAGER' then raise exception 'Manager role required'; end if;
  if p_approved is null or p_authorize_baggage is null or coalesce(length(trim(p_signature)),0) = 0 then raise exception 'Decision and signature required'; end if;
  if not p_approved and coalesce(length(trim(p_remarks)),0) = 0 then raise exception 'Rejection requires remarks'; end if;
  select * into r from public.travel_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.approving_manager_id <> auth.uid() or r.requestor_id = auth.uid() then raise exception 'Not the assigned manager'; end if;
  if r.status <> 'PENDING_APPROVAL' then raise exception 'Request is no longer pending'; end if;
  update public.travel_requests set status = case when p_approved then 'APPROVED_FOR_TMC' else 'REJECTED' end,
    approved_by = auth.uid(),approved_by_signature = trim(p_signature),
    approved_date = (now() at time zone 'Asia/Manila')::date,
    excess_baggage_authorized = p_approved and p_authorize_baggage,
    manager_remarks = p_remarks,updated_at = now() where id = r.id returning * into r;
  insert into public.travel_events(request_id,actor_id,message) values(r.id,auth.uid(),'Manager decision: ' || r.status);
  return r;
end $$;

-- UUID array is in itinerary order. Lock inventory in UUID order to avoid deadlocks.
-- Fares, taxes and baggage are calculated from inventory, never browser totals.
create function public.issue_travel_ticket(p_request_id uuid,p_flight_ids uuid[])
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare r public.travel_requests; f public.flight_schedules; b public.bookings;
  cabin text; travelers integer; excess numeric; leg jsonb; i integer;
  fare numeric := 0; taxes numeric := 0; baggage numeric := 0; multiplier numeric;
  first_departure timestamptz; last_arrival timestamptz; previous_arrival timestamptz;
  carrier text := ''; numbers text := ''; consultant text;
begin
  if travel_private.current_role() is distinct from 'TMC' then raise exception 'TMC role required'; end if;
  select * into r from public.travel_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'APPROVED_FOR_TMC' or r.approved_by is null then raise exception 'Manager approval required'; end if;
  if coalesce(cardinality(p_flight_ids),0) <> jsonb_array_length(r.trip_details->'itineraryLegs')
    or array_position(p_flight_ids,null) is not null
    or (select count(distinct x) from unnest(p_flight_ids) x) <> cardinality(p_flight_ids)
    then raise exception 'Assign one distinct flight per itinerary leg'; end if;
  cabin := r.flight_requirements->>'cabinClass';
  travelers := (r.trip_details->>'numberOfTravelers')::integer;
  excess := (r.flight_requirements->>'excessBaggageKg')::numeric;
  multiplier := case cabin when 'Business' then 2.8 when 'Premium Economy' then 1.65 else 1 end;
  perform id from public.flight_schedules where id = any(p_flight_ids) order by id for update;
  perform flight_id from public.flight_cabins where flight_id = any(p_flight_ids) and cabin_class = cabin order by flight_id for update;
  for i in 1..cardinality(p_flight_ids) loop
    leg := (r.trip_details->'itineraryLegs')->(i-1);
    select * into f from public.flight_schedules where id = p_flight_ids[i];
    if not found then raise exception 'Flight not found'; end if;
    if f.status = 'CANCELLED' or f.origin is distinct from leg->>'origin'
      or f.destination is distinct from leg->>'destination'
      or (f.departure_timestamp at time zone 'Asia/Manila')::date is distinct from (leg->>'date')::date
      or f.departure_timestamp <= now() then raise exception 'Flight does not match requested itinerary'; end if;
    if previous_arrival is not null and f.departure_timestamp <= previous_arrival then raise exception 'Itinerary flight times overlap'; end if;
    update public.flight_cabins set available_seats = available_seats - travelers
      where flight_id = f.id and cabin_class = cabin and available_seats >= travelers;
    if not found then raise exception 'Insufficient cabin seats'; end if;
    fare := fare + round(f.base_fare * multiplier * travelers,2);
    taxes := taxes + f.taxes_and_fees * travelers;
    baggage := baggage + f.baggage_rate_per_kg * excess * travelers;
    if i = 1 then first_departure := f.departure_timestamp; end if;
    last_arrival := f.arrival_timestamp; previous_arrival := f.arrival_timestamp;
    carrier := carrier || case when i > 1 then ' / ' else '' end || f.airline;
    numbers := numbers || case when i > 1 then ' / ' else '' end || f.flight_number;
  end loop;
  select employee_name into consultant from public.profiles where id = auth.uid();
  insert into public.bookings(request_id,tmc_consultant_id,tmc_travel_consultant,booking_reference_pnr,
    airline,flight_number,departure_timestamp,arrival_timestamp,ticket_number,
    base_fare,taxes_and_fees,baggage_fee,excess_baggage_authorized)
  values(r.id,auth.uid(),consultant,upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
    carrier,numbers,first_departure,last_arrival,'079-' || replace(gen_random_uuid()::text,'-',''),
    fare,taxes,baggage,r.excess_baggage_authorized) returning * into b;
  for i in 1..cardinality(p_flight_ids) loop
    insert into public.booking_legs values(b.id,i,p_flight_ids[i],cabin,travelers);
  end loop;
  update public.travel_requests set status = 'TICKETED',updated_at = now() where id = r.id;
  insert into public.travel_events(request_id,actor_id,message) values(r.id,auth.uid(),'Ticket issued: ' || b.booking_reference_pnr);
  return b;
end $$;

create function public.settle_travel_booking(p_booking_id uuid)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare b public.bookings;
begin
  if travel_private.current_role() is distinct from 'TMC' then raise exception 'TMC role required'; end if;
  update public.bookings set payment_status = case when employee_payable_excess_fee > 0 then 'SPLIT_SETTLED' else 'COST_CENTER_CHARGED' end,
    settled_at = now(),settled_by = auth.uid() where id = p_booking_id and payment_status = 'UNBILLED' returning * into b;
  if not found then raise exception 'Booking missing or already settled'; end if;
  insert into public.travel_events(request_id,actor_id,message) values(b.request_id,auth.uid(),'Payment reconciled: ' || b.payment_status);
  return b;
end $$;

revoke all on function public.approve_travel_request(uuid,boolean,text,text,boolean) from public,anon,authenticated;
revoke all on function public.issue_travel_ticket(uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.settle_travel_booking(uuid) from public,anon,authenticated;
grant execute on function public.approve_travel_request(uuid,boolean,text,text,boolean) to authenticated;
grant execute on function public.issue_travel_ticket(uuid,uuid[]) to authenticated;
grant execute on function public.settle_travel_booking(uuid) to authenticated;

commit;

-- Verify: should return seven rows, all with rls_enabled = true.
select tablename, rowsecurity as rls_enabled from pg_tables
where schemaname = 'public' and tablename in
('profiles','travel_requests','flight_schedules','flight_cabins','bookings','booking_legs','travel_events')
order by tablename;
