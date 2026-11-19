-- TMC-only quote/reference entry; preserve locked inventory, approval and billing checks.
-- The third argument is required to avoid ambiguous RPC overload resolution.
begin;
create or replace function public.issue_travel_ticket(p_request_id uuid,p_flight_ids uuid[],p_fulfillment jsonb)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare r public.travel_requests; f public.flight_schedules; b public.bookings;
  cabin text; travelers integer; excess numeric; leg jsonb; i integer;
  fare numeric := 0; taxes numeric := 0; baggage numeric := 0; multiplier numeric;
  first_departure timestamptz; last_arrival timestamptz; previous_arrival timestamptz;
  carrier text := ''; numbers text := ''; consultant text;
  manual jsonb := coalesce(p_fulfillment,'{}'::jsonb); key text; amount numeric;
  pnr text; ticket text;
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
  fare := coalesce((manual->>'baseFare')::numeric,fare);
  taxes := coalesce((manual->>'taxesAndFees')::numeric,taxes);
  baggage := coalesce((manual->>'baggageFee')::numeric,baggage);
  if excess = 0 and baggage > 0 then raise exception 'An excess baggage fee requires a positive requested baggage quantity'; end if;
  if fare + taxes + baggage > 9999999999.99 then raise exception 'Total fare exceeds the supported PHP amount'; end if;
  select coalesce(nullif(trim(manual->>'tmcTravelConsultant'),''),employee_name) into consultant from public.profiles where id = auth.uid();
  insert into public.bookings(request_id,tmc_consultant_id,tmc_travel_consultant,booking_reference_pnr,
    airline,flight_number,departure_timestamp,arrival_timestamp,ticket_number,
    base_fare,taxes_and_fees,baggage_fee,excess_baggage_authorized)
  values(r.id,auth.uid(),consultant,pnr,
    carrier,numbers,first_departure,last_arrival,ticket,
    fare,taxes,baggage,r.excess_baggage_authorized) returning * into b;
  for i in 1..cardinality(p_flight_ids) loop
    insert into public.booking_legs values(b.id,i,p_flight_ids[i],cabin,travelers);
  end loop;
  update public.travel_requests set status = 'TICKETED',updated_at = now() where id = r.id;
  insert into public.travel_events(request_id,actor_id,message) values(r.id,auth.uid(),'Ticket issued: ' || b.booking_reference_pnr || case when manual <> '{}'::jsonb then ' (TMC fulfillment details supplied)' else '' end);
  return b;
exception when unique_violation then
  raise exception 'PNR or ticket number already exists';
end $$;

revoke all on function public.issue_travel_ticket(uuid,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.issue_travel_ticket(uuid,uuid[],jsonb) to authenticated;

-- Existing deployed clients continue to use calculated inventory fares.
create or replace function public.issue_travel_ticket(p_request_id uuid,p_flight_ids uuid[])
returns public.bookings language sql security definer set search_path = '' as $$
 select public.issue_travel_ticket(p_request_id,p_flight_ids,'{}'::jsonb);
$$;
revoke all on function public.issue_travel_ticket(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.issue_travel_ticket(uuid,uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;
