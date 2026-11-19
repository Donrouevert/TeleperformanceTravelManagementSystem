-- Run after outputs/supabase-travel-schema.sql. Back up operational data first.
begin;
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('REQUESTOR','MANAGER','ADMIN','TMC'));
alter table public.travel_requests add column admin_review jsonb;
alter table public.travel_requests drop constraint travel_requests_status_check;
alter table public.travel_requests add constraint travel_requests_status_check check(status in ('PENDING_ADMIN','PENDING_APPROVAL','APPROVED_FOR_TMC','TICKETED','REBOOKING_REQUESTED','REJECTED'));
alter table public.travel_requests alter column status set default 'PENDING_ADMIN';
-- Existing unapproved requests must pass the new intake gate as well.
update public.travel_requests set status='PENDING_ADMIN' where status='PENDING_APPROVAL';

drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using
 (id=auth.uid() or role='MANAGER' or travel_private.current_role() in ('ADMIN','TMC') or approving_manager_id=auth.uid());
drop policy requests_read on public.travel_requests;
create policy requests_read on public.travel_requests for select to authenticated using
 (requestor_id=auth.uid() or (approving_manager_id=auth.uid() and status<>'PENDING_ADMIN') or travel_private.current_role() in ('ADMIN','TMC'));
drop policy requests_submit on public.travel_requests;
create policy requests_submit on public.travel_requests for insert to authenticated with check
 (requestor_id=auth.uid() and travel_private.current_role()='REQUESTOR' and status='PENDING_ADMIN'
 and approved_by is null and admin_review is null and not excess_baggage_authorized
 and exists(select 1 from public.profiles p where p.id=auth.uid() and p.approving_manager_id=travel_requests.approving_manager_id)
 and exists(select 1 from public.profiles p where p.id=travel_requests.approving_manager_id and p.role='MANAGER'));

create function travel_private.validate_submission() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.profiles; m public.profiles; leg jsonb; previous_date date; d date; count_legs integer;
begin
 select * into strict p from public.profiles where id=new.requestor_id;
 select * into strict m from public.profiles where id=new.approving_manager_id and role='MANAGER';
 if new.approving_manager_id is distinct from p.approving_manager_id then raise exception 'Assigned manager mismatch'; end if;
 if length(trim(new.business_justification))<10 or length(trim(new.requested_by_signature))=0 then raise exception 'Justification and signature required';end if;
 if coalesce(new.requestor->>'costCenterProjectCode','') !~ '^[A-Za-z0-9][A-Za-z0-9 _/-]{1,49}$' then raise exception 'Invalid cost center';end if;
 if coalesce(new.requestor->>'contactNumber','') !~ '^\+?[0-9 ().-]+$' or length(regexp_replace(new.requestor->>'contactNumber','[^0-9]','','g')) not between 7 and 15 then raise exception 'Contact number requires 7-15 digits';end if;
 new.requestor := new.requestor || jsonb_build_object('employeeName',p.employee_name,'employeeId',p.employee_id,'emailAddress',p.email_address,'departmentFunction',p.department_function,'position',p.position,'approvingManagerId',m.employee_id,'approvingManagerName',m.employee_name);
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
revoke all on function travel_private.validate_submission() from public,anon,authenticated;
create trigger validate_submission before insert on public.travel_requests for each row execute function travel_private.validate_submission();

create function public.admin_review_travel_request(p_request_id uuid,p_approved boolean,p_remarks text) returns public.travel_requests
language plpgsql security definer set search_path='' as $$
declare r public.travel_requests; reviewer text;
begin
 if travel_private.current_role() is distinct from 'ADMIN' then raise exception 'Admin role required';end if;
 if p_approved is null or coalesce(length(trim(p_remarks)),0)<3 then raise exception 'Review decision and remarks required';end if;
 select * into r from public.travel_requests where id=p_request_id for update;
 if not found or r.status<>'PENDING_ADMIN' then raise exception 'Request is not awaiting admin review';end if;
 select employee_name into reviewer from public.profiles where id=auth.uid();
 update public.travel_requests set status=case when p_approved then 'PENDING_APPROVAL' else 'REJECTED' end,
 admin_review=jsonb_build_object('approved',p_approved,'reviewer',reviewer,'date',(now() at time zone 'Asia/Manila')::date,'remarks',trim(p_remarks)),updated_at=now()
 where id=p_request_id returning * into r;
 insert into public.travel_events(request_id,actor_id,message) values(r.id,auth.uid(),'Admin review: '||r.status);return r;
end $$;

create function public.request_travel_rebooking(p_request_id uuid) returns public.travel_requests language plpgsql security definer set search_path='' as $$
declare r public.travel_requests;
begin
 if travel_private.current_role() is distinct from 'REQUESTOR' then raise exception 'Requestor role required';end if;
 update public.travel_requests set status='REBOOKING_REQUESTED',special_requirements=special_requirements||'{"flightChangeRebookingAssistance":true}'::jsonb,updated_at=now()
 where id=p_request_id and requestor_id=auth.uid() and status='TICKETED' returning * into r;
 if not found then raise exception 'Only your own ticketed journey can be rebooked';end if;
 insert into public.travel_events(request_id,actor_id,message) values(r.id,auth.uid(),'Rebooking assistance requested');return r;
end $$;

create function public.save_travel_schedule(p_flight jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare f public.flight_schedules; fid uuid; c text; seats integer; cap integer; previous public.flight_cabins;
begin
 if travel_private.current_role() is distinct from 'TMC' then raise exception 'TMC role required';end if;
 fid=(p_flight->>'id')::uuid;
 -- Serialize all schedule writes, including concurrent initial inserts.
 perform pg_advisory_xact_lock(hashtextextended(fid::text,0));
 select * into f from public.flight_schedules where id=fid for update;
 if exists(select 1 from public.booking_legs where flight_id=fid) and
 (f.origin is distinct from p_flight->>'origin' or f.destination is distinct from p_flight->>'destination' or f.airline is distinct from p_flight->>'airline' or f.flight_number is distinct from p_flight->>'flightNumber' or f.departure_timestamp is distinct from (p_flight->>'departureTimestamp')::timestamptz or f.arrival_timestamp is distinct from (p_flight->>'arrivalTimestamp')::timestamptz) then raise exception 'Ticketed flight identity cannot change';end if;
 insert into public.flight_schedules(id,airline,flight_number,origin,destination,travel_type,departure_timestamp,arrival_timestamp,base_fare,taxes_and_fees,baggage_allowance_kg,baggage_rate_per_kg,eco_choice,co2_kg,status)
 values(fid,p_flight->>'airline',p_flight->>'flightNumber',p_flight->>'origin',p_flight->>'destination',p_flight->>'travelType',(p_flight->>'departureTimestamp')::timestamptz,(p_flight->>'arrivalTimestamp')::timestamptz,(p_flight->>'baseFare')::numeric,(p_flight->>'taxesAndFees')::numeric,(p_flight->>'baggageAllowanceKg')::numeric,(p_flight->>'baggageRatePerKg')::numeric,(p_flight->>'ecoChoice')::boolean,(p_flight->>'co2Kg')::numeric,p_flight->>'status')
 on conflict(id) do update set base_fare=excluded.base_fare,taxes_and_fees=excluded.taxes_and_fees,origin=excluded.origin,destination=excluded.destination,travel_type=excluded.travel_type,airline=excluded.airline,flight_number=excluded.flight_number,departure_timestamp=excluded.departure_timestamp,arrival_timestamp=excluded.arrival_timestamp,baggage_allowance_kg=excluded.baggage_allowance_kg,baggage_rate_per_kg=excluded.baggage_rate_per_kg,eco_choice=excluded.eco_choice,co2_kg=excluded.co2_kg,status=excluded.status;
 foreach c in array array['Economy','Premium Economy','Business'] loop
 select * into previous from public.flight_cabins where flight_id=fid and cabin_class=c for update;
 seats=(p_flight->'seats'->>c)::integer;cap=(p_flight->'capacity'->>c)::integer;
 if previous.flight_id is not null and cap-seats<previous.capacity-previous.available_seats then raise exception 'Cannot erase reserved seats';end if;
 insert into public.flight_cabins values(fid,c,cap,seats) on conflict(flight_id,cabin_class) do update set capacity=excluded.capacity,available_seats=excluded.available_seats;
 end loop;
 insert into public.travel_events(actor_id,message) values(auth.uid(),'Schedule updated: '||(p_flight->>'flightNumber'));return fid;
end $$;
create function public.delete_travel_schedule(p_flight_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if travel_private.current_role() is distinct from 'TMC' then raise exception 'TMC role required';end if;
 perform id from public.flight_schedules where id=p_flight_id for update;
 if exists(select 1 from public.booking_legs where flight_id=p_flight_id) then raise exception 'Ticketed flights cannot be deleted';end if;
 delete from public.flight_schedules where id=p_flight_id;
end $$;

-- Persistent free-plan protection: cache first, maximum 80 upstream calls/month,
-- and one uncached request/user/minute. No automatic polling or paid fallback.
create table public.aviation_cache(code text primary key,payload jsonb not null,expires_at timestamptz not null);
create table public.aviation_usage(id bigint generated always as identity primary key,user_id uuid not null references auth.users(id),created_at timestamptz not null default now());
create index aviation_usage_date_idx on public.aviation_usage(created_at);
alter table public.aviation_cache enable row level security;
alter table public.aviation_usage enable row level security;
revoke all on public.aviation_cache,public.aviation_usage from anon,authenticated;
grant all on public.aviation_cache,public.aviation_usage to service_role;
grant usage on sequence public.aviation_usage_id_seq to service_role;
create function public.reserve_aviation_lookup(p_code text,p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare cached jsonb;
begin
 perform pg_advisory_xact_lock(98371420);
 select payload into cached from public.aviation_cache where code=p_code and expires_at>now();
 if cached is not null then return jsonb_build_object('cached',true,'payload',cached);end if;
 if (select count(*) from public.aviation_usage where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')>=80 then raise exception 'Monthly lookup budget reached';end if;
 if exists(select 1 from public.aviation_usage where user_id=p_user and created_at>now()-interval '1 minute') then raise exception 'Wait one minute between uncached lookups';end if;
 insert into public.aviation_usage(user_id) values(p_user);return jsonb_build_object('cached',false);
end $$;

revoke all on function public.admin_review_travel_request(uuid,boolean,text),public.request_travel_rebooking(uuid),public.save_travel_schedule(jsonb),public.delete_travel_schedule(uuid),public.reserve_aviation_lookup(text,uuid) from public,anon,authenticated;
grant execute on function public.admin_review_travel_request(uuid,boolean,text),public.request_travel_rebooking(uuid),public.save_travel_schedule(jsonb),public.delete_travel_schedule(uuid) to authenticated;
grant execute on function public.reserve_aviation_lookup(text,uuid) to service_role;
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['travel_requests','bookings','flight_schedules','flight_cabins','travel_events'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
 end loop;end if;
 end $$;
commit;
