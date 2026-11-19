begin;
-- Keep schedule validation aligned with the corporate destination directory.
-- This broadens allowed airport codes without modifying existing schedules or RLS.
alter table public.flight_schedules drop constraint if exists flight_schedules_origin_check;
alter table public.flight_schedules drop constraint if exists flight_schedules_destination_check;
alter table public.flight_schedules add constraint flight_schedules_origin_check check (origin in ('MNL','CEB','DVO','ILO','DRP','MPH','SIN','HKG','NRT','CGK','BKK','LHR','AMS','ZRH','EWR','YYZ','GRU','DXB','JNB','NBO'));
alter table public.flight_schedules add constraint flight_schedules_destination_check check (destination in ('MNL','CEB','DVO','ILO','DRP','MPH','SIN','HKG','NRT','CGK','BKK','LHR','AMS','ZRH','EWR','YYZ','GRU','DXB','JNB','NBO'));
commit;
