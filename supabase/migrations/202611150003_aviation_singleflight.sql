-- Coalesce concurrent cache misses for one flight before reserving provider quota.
begin;
create table if not exists public.aviation_inflight(code text primary key,expires_at timestamptz not null);
alter table public.aviation_inflight enable row level security;
revoke all on public.aviation_inflight from public,anon,authenticated;
grant all on public.aviation_inflight to service_role;
create or replace function public.reserve_aviation_lookup(p_code text,p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cached jsonb; acquired text;
begin
 perform pg_advisory_xact_lock(98371420);
 select payload into cached from public.aviation_cache where code=p_code and expires_at>now();
 if cached is not null then return jsonb_build_object('cached',true,'payload',cached);end if;
 if exists(select 1 from public.aviation_inflight where code=p_code and expires_at>now()) then return jsonb_build_object('pending',true);end if;
 if (select count(*) from public.aviation_usage where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')>=80 then raise exception 'Monthly lookup budget reached';end if;
 if exists(select 1 from public.aviation_usage where user_id=p_user and created_at>now()-interval '1 minute') then raise exception 'Wait one minute between uncached lookups';end if;
 insert into public.aviation_inflight(code,expires_at) values(p_code,now()+interval '30 seconds') on conflict(code) do update set expires_at=excluded.expires_at;
 insert into public.aviation_usage(user_id) values(p_user);
 return jsonb_build_object('cached',false);
end $$;
revoke all on function public.reserve_aviation_lookup(text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_aviation_lookup(text,uuid) to service_role;
commit;
