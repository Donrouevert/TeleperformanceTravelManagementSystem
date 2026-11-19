-- Role-specific workflow, approved budgets, revisions and atomic rebooking.
begin;
alter table public.travel_requests add column if not exists approved_budget numeric(12,2) check(approved_budget>=0), add column if not exists correction_note text, add column if not exists revision integer not null default 1, add column if not exists is_rebooking boolean not null default false, add column if not exists tmc_quote jsonb;
alter table public.travel_requests drop constraint travel_requests_status_check;
alter table public.travel_requests add constraint travel_requests_status_check check(status in ('PENDING_ADMIN','PENDING_APPROVAL','APPROVED_FOR_TMC','TICKETED','REBOOKING_REQUESTED','REJECTED','CHANGES_REQUESTED'));
alter table public.bookings add column if not exists settled_company_php numeric(12,2) not null default 0, add column if not exists settled_employee_php numeric(12,2) not null default 0;
update public.bookings set settled_company_php=company_billable_total,settled_employee_php=employee_payable_excess_fee where payment_status<>'UNBILLED';
create table public.request_revisions(id uuid primary key default gen_random_uuid(),request_id uuid not null references public.travel_requests(id),actor_id uuid not null references public.profiles(id),kind text not null,snapshot jsonb not null,note text not null default '',created_at timestamptz not null default now());
create table public.booking_revisions(id uuid primary key default gen_random_uuid(),request_id uuid not null references public.travel_requests(id),booking_id uuid not null references public.bookings(id),actor_id uuid not null references public.profiles(id),snapshot jsonb not null,created_at timestamptz not null default now());
create table public.billing_adjustments(id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id),actor_id uuid not null references public.profiles(id),kind text not null default 'RECONCILIATION',company_php numeric(12,2) not null,employee_php numeric(12,2) not null,created_at timestamptz not null default now());
insert into public.billing_adjustments(booking_id,actor_id,kind,company_php,employee_php) select id,coalesce(settled_by,tmc_consultant_id),'OPENING_BALANCE',settled_company_php,settled_employee_php from public.bookings where payment_status<>'UNBILLED';
alter table public.request_revisions enable row level security;alter table public.booking_revisions enable row level security;alter table public.billing_adjustments enable row level security;
grant select on public.request_revisions,public.booking_revisions,public.billing_adjustments to authenticated;
create policy revisions_read on public.request_revisions for select to authenticated using(exists(select 1 from public.travel_requests r where r.id=request_id));
create policy booking_revisions_read on public.booking_revisions for select to authenticated using(exists(select 1 from public.travel_requests r where r.id=request_id));
create policy billing_adjustments_read on public.billing_adjustments for select to authenticated using(exists(select 1 from public.bookings b where b.id=booking_id));
-- Unticketed approvals need an explicit spending limit. Historical tickets are retained.
insert into public.request_revisions(request_id,actor_id,kind,snapshot,note) select id,approved_by,'BUDGET_REVIEW_REQUIRED',to_jsonb(r),'Budget approval introduced; previous approval retained in history' from public.travel_requests r where status='APPROVED_FOR_TMC' and approved_budget is null and approved_by is not null;
update public.travel_requests set status=case when admin_review->>'approved'='true' then 'PENDING_APPROVAL' else 'PENDING_ADMIN' end,approved_by=null,approved_by_signature=null,approved_date=null where status='APPROVED_FOR_TMC' and approved_budget is null;
create or replace function travel_private.build_ticket_quote(p_request_id uuid,p_flight_ids uuid[],p_fulfillment jsonb,p_include_held boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.travel_requests; f public.flight_schedules; b public.bookings;
  cabin text; travelers integer; excess numeric; leg jsonb; i integer;
  fare numeric := 0; taxes numeric := 0; baggage numeric := 0; multiplier numeric;
  first_departure timestamptz; last_arrival timestamptz; previous_arrival timestamptz;
  carrier text := ''; numbers text := ''; consultant text;
  manual jsonb := coalesce(p_fulfillment,'{}'::jsonb); key text; amount numeric;
  pnr text; ticket text; seats_available integer;
begin
  if travel_private.current_role() is distinct from 'TMC' then raise exception 'TMC role required'; end if;
  if jsonb_typeof(manual) <> 'object' or manual - array['baseFare','taxesAndFees','baggageFee','bookingReferencePnr','ticketNumber','tmcTravelConsultant']::text[] <> '{}'::jsonb then
    raise exception 'Unsupported fulfillment fields';
  end if;
  foreach key in array array['baseFare','taxesAndFees','baggageFee'] loop
    if manual ? key and manual->key <> 'null'::jsonb then
      if jsonb_typeof(manual->key) <> 'number' then raise exception 'Fare amounts must be numbers'; end if;
      amount := (manual->>key)::numeric;
      if amount < 0 or amount > 9999999999.99 or amount <> round(amount,2) then
        raise exception 'Amounts must be non-negative PHP values with at most two decimal places';
      end if;
    end if;
  end loop;
  foreach key in array array['bookingReferencePnr','ticketNumber','tmcTravelConsultant'] loop
    if manual ? key and manual->key <> 'null'::jsonb and jsonb_typeof(manual->key) <> 'string' then
      raise exception 'Consultant and ticket references must be text';
    end if;
  end loop;
  pnr := coalesce(nullif(upper(trim(manual->>'bookingReferencePnr')),''),upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)));
  ticket := coalesce(nullif(trim(manual->>'ticketNumber'),''),'079-' || replace(gen_random_uuid()::text,'-',''));
  if pnr !~ '^[A-Z0-9]{6}$' then raise exception 'PNR must contain exactly six uppercase letters or digits'; end if;
  if ticket !~ '^[A-Za-z0-9-]{1,50}$' then raise exception 'Ticket number must contain 1-50 letters, digits or hyphens'; end if;
  if manual ? 'tmcTravelConsultant' and manual->'tmcTravelConsultant' <> 'null'::jsonb
    and length(trim(manual->>'tmcTravelConsultant')) not between 1 and 120 then raise exception 'Enter a TMC consultant name (1-120 characters)'; end if;
  select * into r from public.travel_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;

  if coalesce(cardinality(p_flight_ids),0) <> jsonb_array_length(r.trip_details->'itineraryLegs')
    or array_position(p_flight_ids,null) is not null
    or (select count(distinct x) from unnest(p_flight_ids) x) <> cardinality(p_flight_ids)
    then raise exception 'Assign one distinct flight per itinerary leg'; end if;
  cabin := r.flight_requirements->>'cabinClass';
  travelers := (r.trip_details->>'numberOfTravelers')::integer;
  excess := (r.flight_requirements->>'excessBaggageKg')::numeric;
  multiplier := case cabin when 'Business' then 2.8 when 'Premium Economy' then 1.65 else 1 end;

  for i in 1..cardinality(p_flight_ids) loop
    leg := (r.trip_details->'itineraryLegs')->(i-1);
    select * into f from public.flight_schedules where id = p_flight_ids[i];
    if not found then raise exception 'Flight not found'; end if;
    if f.status = 'CANCELLED' or f.origin is distinct from leg->>'origin'
      or f.destination is distinct from leg->>'destination'
      or (f.departure_timestamp at time zone 'Asia/Manila')::date is distinct from (leg->>'date')::date
      or f.departure_timestamp <= now() then raise exception 'Flight does not match requested itinerary'; end if;
    if previous_arrival is not null and f.departure_timestamp <= previous_arrival then raise exception 'Itinerary flight times overlap'; end if;
    select c.available_seats + case when p_include_held then coalesce((select sum(l.travelers) from public.booking_legs l join public.bookings old on old.id=l.booking_id where old.request_id=r.id and l.flight_id=f.id and l.cabin_class=cabin),0) else 0 end into seats_available from public.flight_cabins c where c.flight_id=f.id and c.cabin_class=cabin;
    if seats_available is null or seats_available < travelers then raise exception 'Insufficient cabin seats'; end if;
    fare := fare + round(f.base_fare * multiplier * travelers,2);
    taxes := taxes + f.taxes_and_fees * travelers;
    baggage := baggage + f.baggage_rate_per_kg * excess * travelers;
    if i = 1 then first_departure := f.departure_timestamp; end if;
    last_arrival := f.arrival_timestamp; previous_arrival := f.arrival_timestamp;
    carrier := carrier || case when i > 1 then ' / ' else '' end || f.airline;
    numbers := numbers || case when i > 1 then ' / ' else '' end || f.flight_number;
  end loop;
  fare := coalesce((manual->>'baseFare')::numeric,fare);
  taxes := coalesce((manual->>'taxesAndFees')::numeric,taxes);
  baggage := coalesce((manual->>'baggageFee')::numeric,baggage);
  if excess = 0 and baggage > 0 then raise exception 'An excess baggage fee requires a positive requested baggage quantity'; end if;
  if fare + taxes + baggage > 9999999999.99 then raise exception 'Total fare exceeds the supported PHP amount'; end if;
  select coalesce(nullif(trim(manual->>'tmcTravelConsultant'),''),employee_name) into consultant from public.profiles where id = auth.uid();
  fare:=round(fare,2); taxes:=round(taxes,2); baggage:=round(baggage,2);
  return jsonb_build_object('base',fare,'taxes',taxes,'baggage',baggage,'total',fare+taxes+baggage,'company',fare+taxes+case when r.excess_baggage_authorized then baggage else 0 end,'employee',case when r.excess_baggage_authorized then 0 else baggage end,'pnr',pnr,'ticket',ticket,'consultant',consultant,'carrier',carrier,'numbers',numbers,'departure',first_departure,'arrival',last_arrival);
end $$;
revoke all on function travel_private.build_ticket_quote(uuid,uuid[],jsonb,boolean) from public,anon,authenticated;

create function public.approve_travel_request(p_request_id uuid,p_approved boolean,p_signature text,p_remarks text,p_authorize_baggage boolean,p_budget numeric)
returns public.travel_requests language plpgsql security definer set search_path='' as $$
declare r public.travel_requests;
begin
 if travel_private.current_role() is distinct from 'MANAGER' then raise exception 'Manager role required';end if;
 select * into r from public.travel_requests where id=p_request_id for update;
 if not found then raise exception 'Request not found';end if;
 if r.approving_manager_id<>auth.uid() or r.requestor_id=auth.uid() then raise exception 'Not the assigned manager';end if;
 if r.status<>'PENDING_APPROVAL' then raise exception 'Request is no longer pending';end if;
 if r.admin_review->>'approved' is distinct from 'true' then raise exception 'Admin clearance required';end if;
 if p_approved is null or p_authorize_baggage is null or coalesce(length(trim(p_signature)),0)=0 then raise exception 'Decision and signature required';end if;
 if not p_approved and coalesce(length(trim(p_remarks)),0)=0 then raise exception 'Rejection requires remarks';end if;
 if p_approved and (p_budget is null or p_budget::text in ('NaN','Infinity','-Infinity') or p_budget<0 or p_budget>9999999999.99 or p_budget<>round(p_budget,2)) then raise exception 'Enter a non-negative approved total booking budget in PHP';end if;
 if p_approved and r.tmc_quote is not null and p_budget<(r.tmc_quote->>'total')::numeric then raise exception 'Approved budget must cover the submitted TMC quote';end if;
 insert into public.request_revisions(request_id,actor_id,kind,snapshot,note) values(r.id,auth.uid(),'MANAGER_REVIEW',to_jsonb(r),coalesce(p_remarks,''));
 update public.travel_requests set status=case when p_approved then 'APPROVED_FOR_TMC' else 'REJECTED' end,approved_budget=case when p_approved then p_budget else null end,approved_by=auth.uid(),approved_by_signature=trim(p_signature),approved_date=(now() at time zone 'Asia/Manila')::date,excess_baggage_authorized=p_approved and p_authorize_baggage,manager_remarks=p_remarks,updated_at=now() where id=r.id returning * into r;
 insert into public.travel_events(request_id,actor_id,message) values(r.id,auth.uid(),'Manager decision: '||r.status||case when p_approved then ' · approved total PHP '||p_budget else '' end);
 return r;
end $$;
-- Old clients may reject, but cannot approve without explicitly reviewing a budget.
create or replace function public.approve_travel_request(p_request_id uuid,p_approved boolean,p_signature text,p_remarks text default '',p_authorize_baggage boolean default false)
returns public.travel_requests language plpgsql security definer set search_path='' as $$
begin
 if p_approved then raise exception 'Budget approval is required. Refresh the application to review the spending limit.';end if;
 return public.approve_travel_request(p_request_id,p_approved,p_signature,p_remarks,p_authorize_baggage,null);
end $$;

create function public.return_travel_request(p_request_id uuid,p_note text) returns public.travel_requests language plpgsql security definer set search_path='' as $$
declare r public.travel_requests;who text:=travel_private.current_role();
begin
 select * into r from public.travel_requests where id=p_request_id for update;
 if not found then raise exception 'Request not found';end if;
 if not (who='ADMIN' and r.status='PENDING_ADMIN' or who='MANAGER' and r.status='PENDING_APPROVAL' and r.approving_manager_id=auth.uid() or who='TMC' and r.status='REBOOKING_REQUESTED') then raise exception 'This request cannot be returned by your role';end if;
 if coalesce(length(trim(p_note)),0)<3 then raise exception 'Describe the corrections required';end if;
 insert into public.request_revisions(request_id,actor_id,kind,snapshot,note) values(r.id,auth.uid(),'RETURNED_FOR_CORRECTION',to_jsonb(r),trim(p_note));
 update public.travel_requests set status='CHANGES_REQUESTED',excess_baggage_authorized=false,manager_remarks=null,is_rebooking=is_rebooking or status='REBOOKING_REQUESTED',correction_note=trim(p_note),approved_budget=null,approved_by=null,approved_by_signature=null,approved_date=null,tmc_quote=null,updated_at=now() where id=r.id returning * into r;
 insert into public.travel_events(request_id,actor_id,message) values(r.id,auth.uid(),'Returned for correction: '||trim(p_note));return r;
end $$;

create function public.resubmit_travel_request(p_request_id uuid,p_request jsonb,p_mode text) returns public.travel_requests language plpgsql security definer set search_path='' as $$
declare r public.travel_requests;manager uuid;has_booking boolean;
begin
 if travel_private.current_role() is distinct from 'REQUESTOR' then raise exception 'Requestor role required';end if;
 select * into r from public.travel_requests where id=p_request_id for update;
 if not found or r.requestor_id<>auth.uid() then raise exception 'Only the request owner can revise this journey';end if;
 if not (p_mode='correction' and r.status='CHANGES_REQUESTED' or p_mode='rebook' and r.status in ('TICKETED','REBOOKING_REQUESTED')) then raise exception 'Request is not available for this revision';end if;
 if jsonb_typeof(p_request) is distinct from 'object' or jsonb_typeof(p_request->'requestor') is distinct from 'object' or jsonb_typeof(p_request->'tripDetails') is distinct from 'object' or jsonb_typeof(p_request->'flightRequirements') is distinct from 'object' or jsonb_typeof(p_request->'approval') is distinct from 'object' then raise exception 'Complete revision details are required';end if;
 if coalesce((p_request->>'revision')::integer,1)<>r.revision then raise exception 'This request changed. Refresh before submitting your revision.';end if;
 select approving_manager_id into manager from public.profiles where id=auth.uid();
 select exists(select 1 from public.bookings where request_id=r.id) into has_booking;
 insert into public.request_revisions(request_id,actor_id,kind,snapshot,note) values(r.id,auth.uid(),case when p_mode='rebook' then 'REBOOKING_STARTED' else 'CORRECTION_RESUBMITTED' end,to_jsonb(r),coalesce(r.correction_note,''));
 update public.travel_requests set requestor=p_request->'requestor',trip_details=p_request->'tripDetails',flight_requirements=p_request->'flightRequirements',special_requirements=coalesce(p_request->'specialRequirements','{}'::jsonb),business_justification=p_request->'approval'->>'businessJustification',requested_by_signature=p_request->'approval'->>'requestedBySignature',requested_date=(now() at time zone 'Asia/Manila')::date,approving_manager_id=manager,status='PENDING_ADMIN',admin_review=null,approved_by=null,approved_by_signature=null,approved_date=null,approved_budget=null,excess_baggage_authorized=false,manager_remarks=null,tmc_quote=null,correction_note=null,revision=revision+1,is_rebooking=has_booking,updated_at=now() where id=r.id returning * into r;
 insert into public.travel_events(request_id,actor_id,message) values(r.id,auth.uid(),case when has_booking then 'Revised itinerary submitted for admin review; existing ticket retained' else 'Corrected request resubmitted for admin review' end);return r;
end $$;
create or replace function travel_private.validate_submission() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.profiles; m public.profiles; leg jsonb; previous_date date; d date; count_legs integer;
begin
 select * into strict p from public.profiles where id=new.requestor_id;
 select * into strict m from public.profiles where id=new.approving_manager_id and role='MANAGER';
 if new.approving_manager_id is distinct from p.approving_manager_id then raise exception 'Assigned manager mismatch'; end if;
 if length(trim(new.business_justification))<10 or length(trim(new.requested_by_signature))=0 then raise exception 'Justification and signature required';end if;
 if coalesce(new.requestor->>'costCenterProjectCode','') !~ '^[A-Za-z0-9][A-Za-z0-9 _/-]{1,49}$' then raise exception 'Invalid cost center';end if;
 if coalesce(new.requestor->>'contactNumber','') !~ '^\+?[0-9 ().-]+$' or length(regexp_replace(new.requestor->>'contactNumber','[^0-9]','','g')) not between 7 and 15 then raise exception 'Contact number requires 7-15 digits';end if;
 new.requestor := new.requestor || jsonb_build_object('employeeName',p.employee_name,'employeeId',p.employee_id,'emailAddress',p.email_address,'approvingManagerId',m.employee_id,'approvingManagerName',m.employee_name);
 if coalesce(length(trim(new.requestor->>'departmentFunction')),0)=0 or coalesce(length(trim(new.requestor->>'position')),0)=0 then raise exception 'Department and position required';end if;
 if coalesce(trim(new.trip_details->>'destinationCountryCity'),'')='' or coalesce(new.trip_details->>'preferredDepartureTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Destination and departure time required';end if;
 if (new.trip_details->>'purposeOfTravel')='Other' and coalesce(trim(new.trip_details->>'purposeOtherText'),'')='' then raise exception 'Other travel purpose required';end if;
 count_legs=jsonb_array_length(new.trip_details->'itineraryLegs');
 if (new.trip_details->>'tripType')='One-Way' and count_legs<>1 or (new.trip_details->>'tripType')='Round Trip' and count_legs<>2 or (new.trip_details->>'tripType')='Multi-City' and count_legs<2 then raise exception 'Itinerary length does not match trip type';end if;
 for leg in select * from jsonb_array_elements(new.trip_details->'itineraryLegs') loop
   if coalesce(leg->>'origin','') !~ '^[A-Z]{3}$' or coalesce(leg->>'destination','') !~ '^[A-Z]{3}$' or leg->>'origin'=leg->>'destination' then raise exception 'Invalid itinerary airports';end if;
   d=(leg->>'date')::date;if d is null or d<(now() at time zone 'Asia/Manila')::date or (previous_date is not null and d<previous_date) then raise exception 'Invalid itinerary dates';end if;previous_date=d;
 end loop;
 if ((new.trip_details->'itineraryLegs')->0->>'date')::date is distinct from (new.trip_details->>'departureDate')::date then raise exception 'Departure date mismatch';end if;
 if new.trip_details->>'tripType'='Round Trip' then
   if coalesce(new.trip_details->>'preferredReturnTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or ((new.trip_details->'itineraryLegs')->1->>'date')::date is distinct from (new.trip_details->>'returnDate')::date then raise exception 'Return date and time required';end if;
   if (new.trip_details->'itineraryLegs')->0->>'origin' is distinct from (new.trip_details->'itineraryLegs')->1->>'destination' or (new.trip_details->'itineraryLegs')->0->>'destination' is distinct from (new.trip_details->'itineraryLegs')->1->>'origin' then raise exception 'Round trip must return to the origin';end if;
 end if;
 if new.flight_requirements->>'baggageRequirement'='Additional Baggage' and (new.flight_requirements->>'excessBaggageKg')::numeric<=0 then raise exception 'Additional baggage quantity required';end if;
 return new;
end $$;

-- Apply the same protected identity and itinerary validation to revised submissions.
create trigger validate_revised_submission before update of requestor,trip_details,flight_requirements,business_justification,requested_by_signature on public.travel_requests for each row when (new.status='PENDING_ADMIN') execute function travel_private.validate_submission();
create function travel_private.validate_estimate() returns trigger language plpgsql set search_path='' as $$
begin
 if new.trip_details ? 'estimatedTotalPhp' then
  if jsonb_typeof(new.trip_details->'estimatedTotalPhp')<>'number' or (new.trip_details->>'estimatedTotalPhp')::numeric<0 or (new.trip_details->>'estimatedTotalPhp')::numeric>9999999999.99 or (new.trip_details->>'estimatedTotalPhp')::numeric<>round((new.trip_details->>'estimatedTotalPhp')::numeric,2) then raise exception 'Enter a non-negative estimated total in PHP';end if;
 end if;return new;
end $$;
create trigger validate_estimate before insert or update of trip_details on public.travel_requests for each row execute function travel_private.validate_estimate();
revoke all on function travel_private.validate_estimate() from public,anon,authenticated;

create function public.cancel_travel_rebooking(p_request_id uuid) returns public.travel_requests language plpgsql security definer set search_path='' as $$
declare r public.travel_requests;s jsonb;
begin
 select * into r from public.travel_requests where id=p_request_id for update;
 if travel_private.current_role() is distinct from 'REQUESTOR' or not found or r.requestor_id<>auth.uid() or not (r.is_rebooking or r.status='REBOOKING_REQUESTED') or r.status='TICKETED' then raise exception 'Only the owner can withdraw pending rebooking changes';end if;
 select snapshot into s from public.request_revisions where request_id=r.id and kind='REBOOKING_STARTED' order by (snapshot->>'revision')::integer desc,created_at desc,id desc limit 1;
 insert into public.request_revisions(request_id,actor_id,kind,snapshot,note) values(r.id,auth.uid(),'REBOOKING_WITHDRAWN',to_jsonb(r),'Original ticket retained');
 if s is not null then
  update public.travel_requests set approving_manager_id=(s->>'approving_manager_id')::uuid,manager_remarks=s->>'manager_remarks',requested_date=(s->>'requested_date')::date,requestor=s->'requestor',trip_details=s->'trip_details',flight_requirements=s->'flight_requirements',special_requirements=s->'special_requirements',business_justification=s->>'business_justification',requested_by_signature=s->>'requested_by_signature',admin_review=s->'admin_review',approved_by=(s->>'approved_by')::uuid,approved_by_signature=s->>'approved_by_signature',approved_date=(s->>'approved_date')::date,approved_budget=(s->>'approved_budget')::numeric,excess_baggage_authorized=(s->>'excess_baggage_authorized')::boolean,status='TICKETED',is_rebooking=false,correction_note=null,tmc_quote=null,revision=revision+1,updated_at=now() where id=r.id returning * into r;
 else update public.travel_requests set status='TICKETED',is_rebooking=false,correction_note=null,tmc_quote=null,updated_at=now() where id=r.id returning * into r;end if;
 insert into public.travel_events(request_id,actor_id,message) values(r.id,auth.uid(),'Rebooking changes withdrawn; original ticket retained');return r;
end $$;

create function public.submit_tmc_quote(p_request_id uuid,p_flight_ids uuid[],p_fulfillment jsonb) returns public.travel_requests language plpgsql security definer set search_path='' as $$
declare r public.travel_requests;q jsonb;
begin
 if travel_private.current_role() is distinct from 'TMC' then raise exception 'TMC role required';end if;
 select * into r from public.travel_requests where id=p_request_id for update;
 if not found or r.status<>'APPROVED_FOR_TMC' then raise exception 'Quote requires an approved itinerary';end if;
 q:=travel_private.build_ticket_quote(r.id,p_flight_ids,p_fulfillment,true);
 insert into public.request_revisions(request_id,actor_id,kind,snapshot,note) values(r.id,auth.uid(),'TMC_QUOTE_REVIEW',to_jsonb(r),'Final quote requires manager budget approval');
 update public.travel_requests set tmc_quote=jsonb_build_object('flightIds',to_jsonb(p_flight_ids),'fulfillment',p_fulfillment,'total',q->'total','company',q->'company','employee',q->'employee','revision',revision),status='PENDING_APPROVAL',approved_budget=null,approved_by=null,approved_by_signature=null,approved_date=null,updated_at=now() where id=r.id returning * into r;
 insert into public.travel_events(request_id,actor_id,message) values(r.id,auth.uid(),'TMC quote sent for manager budget approval: PHP '||(q->>'total'));return r;
end $$;

create or replace function public.issue_travel_ticket(p_request_id uuid,p_flight_ids uuid[],p_fulfillment jsonb)
returns public.bookings language plpgsql security definer set search_path='' as $$
declare r public.travel_requests;b public.bookings;old public.bookings;q jsonb;held public.booking_legs;all_ids uuid[];i integer;cabin text;travelers integer;
begin
 if travel_private.current_role() is distinct from 'TMC' then raise exception 'TMC role required';end if;
 select * into r from public.travel_requests where id=p_request_id for update;
 if not found or r.status<>'APPROVED_FOR_TMC' or r.approved_by is null then raise exception 'Manager approval required';end if;
 if r.approved_budget is null then raise exception 'Manager must approve a total booking budget before ticketing';end if;
 select * into old from public.bookings where request_id=r.id for update;
 if old.id is not null and not r.is_rebooking then raise exception 'Ticket already issued';end if;
 select array_agg(distinct id) into all_ids from (select unnest(p_flight_ids) id union select flight_id from public.booking_legs where booking_id=old.id)x;
 perform id from public.flight_schedules where id=any(all_ids) order by id for update;
 perform flight_id from public.flight_cabins where flight_id=any(all_ids) order by flight_id,cabin_class for update;
 if old.id is not null then
  for held in select * from public.booking_legs where booking_id=old.id loop
   update public.flight_cabins set available_seats=available_seats+held.travelers where flight_id=held.flight_id and cabin_class=held.cabin_class;
  end loop;
 end if;
 q:=travel_private.build_ticket_quote(r.id,p_flight_ids,p_fulfillment,false);
 if (q->>'total')::numeric>r.approved_budget then raise exception 'Final fare exceeds the approved budget. Submit the quote for manager approval.';end if;
 cabin:=r.flight_requirements->>'cabinClass';travelers:=(r.trip_details->>'numberOfTravelers')::integer;
 for i in 1..cardinality(p_flight_ids) loop
  update public.flight_cabins set available_seats=available_seats-travelers where flight_id=p_flight_ids[i] and cabin_class=cabin and available_seats>=travelers;
  if not found then raise exception 'Insufficient cabin seats';end if;
 end loop;
 if old.id is not null then
  insert into public.booking_revisions(request_id,booking_id,actor_id,snapshot) values(r.id,old.id,auth.uid(),to_jsonb(old)||jsonb_build_object('legs',(select jsonb_agg(to_jsonb(l)) from public.booking_legs l where booking_id=old.id)));
  delete from public.booking_legs where booking_id=old.id;
 end if;
 insert into public.bookings(request_id,tmc_consultant_id,tmc_travel_consultant,booking_reference_pnr,airline,flight_number,departure_timestamp,arrival_timestamp,ticket_number,base_fare,taxes_and_fees,baggage_fee,excess_baggage_authorized)
 values(r.id,auth.uid(),q->>'consultant',q->>'pnr',q->>'carrier',q->>'numbers',(q->>'departure')::timestamptz,(q->>'arrival')::timestamptz,q->>'ticket',(q->>'base')::numeric,(q->>'taxes')::numeric,(q->>'baggage')::numeric,r.excess_baggage_authorized)
 on conflict(request_id) do update set tmc_consultant_id=excluded.tmc_consultant_id,tmc_travel_consultant=excluded.tmc_travel_consultant,booking_reference_pnr=excluded.booking_reference_pnr,airline=excluded.airline,flight_number=excluded.flight_number,departure_timestamp=excluded.departure_timestamp,arrival_timestamp=excluded.arrival_timestamp,ticket_number=excluded.ticket_number,base_fare=excluded.base_fare,taxes_and_fees=excluded.taxes_and_fees,baggage_fee=excluded.baggage_fee,excess_baggage_authorized=excluded.excess_baggage_authorized,booking_date=(now() at time zone 'Asia/Manila')::date,payment_status=case when old.payment_status<>'UNBILLED' and (q->>'company')::numeric=old.settled_company_php and (q->>'employee')::numeric=old.settled_employee_php then old.payment_status else 'UNBILLED' end
 returning * into b;
 for i in 1..cardinality(p_flight_ids) loop insert into public.booking_legs values(b.id,i,p_flight_ids[i],cabin,travelers);end loop;
 update public.travel_requests set status='TICKETED',is_rebooking=false,tmc_quote=null,correction_note=null,updated_at=now() where id=r.id;
 insert into public.travel_events(request_id,actor_id,message) values(r.id,auth.uid(),case when old.id is null then 'Ticket issued: ' else 'Replacement ticket issued: ' end||b.booking_reference_pnr);
 return b;
exception when unique_violation then raise exception 'PNR or ticket number already exists';
end $$;

create or replace function public.settle_travel_booking(p_booking_id uuid) returns public.bookings language plpgsql security definer set search_path='' as $$
declare b public.bookings;
begin
 if travel_private.current_role() is distinct from 'TMC' then raise exception 'TMC role required';end if;
 select * into b from public.bookings where id=p_booking_id for update;
 if not found or b.payment_status<>'UNBILLED' then raise exception 'Booking missing or already settled';end if;
 insert into public.billing_adjustments(booking_id,actor_id,company_php,employee_php) values(b.id,auth.uid(),b.company_billable_total-b.settled_company_php,b.employee_payable_excess_fee-b.settled_employee_php);
 update public.bookings set settled_company_php=company_billable_total,settled_employee_php=employee_payable_excess_fee,payment_status=case when employee_payable_excess_fee>0 then 'SPLIT_SETTLED' else 'COST_CENTER_CHARGED' end,settled_at=now(),settled_by=auth.uid() where id=b.id returning * into b;
 insert into public.travel_events(request_id,actor_id,message) values(b.request_id,auth.uid(),'Billing balance/credit reconciled: '||b.payment_status);return b;
end $$;

revoke all on function public.approve_travel_request(uuid,boolean,text,text,boolean,numeric),public.return_travel_request(uuid,text),public.resubmit_travel_request(uuid,jsonb,text),public.cancel_travel_rebooking(uuid),public.submit_tmc_quote(uuid,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.approve_travel_request(uuid,boolean,text,text,boolean,numeric),public.return_travel_request(uuid,text),public.resubmit_travel_request(uuid,jsonb,text),public.cancel_travel_rebooking(uuid),public.submit_tmc_quote(uuid,uuid[],jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
