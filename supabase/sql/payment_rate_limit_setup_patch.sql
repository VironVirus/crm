-- Ifemelunma Cooperative Society
-- Payment rate-limit setup patch.
-- Run this in the Supabase SQL editor if payments show:
-- "Unable to verify the payment rate limit right now."

create or replace function public.current_user_has_any_role(required_roles public.roles[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = any(required_roles)
  );
$$;

revoke all on function public.current_user_has_any_role(public.roles[]) from public;
grant execute on function public.current_user_has_any_role(public.roles[]) to authenticated;
grant execute on function public.current_user_has_any_role(public.roles[]) to service_role;

create or replace function public.current_user_can_manage_financial_records()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_any_role(array['admin', 'treasurer']::public.roles[]);
$$;

revoke all on function public.current_user_can_manage_financial_records() from public;
grant execute on function public.current_user_can_manage_financial_records() to authenticated;
grant execute on function public.current_user_can_manage_financial_records() to service_role;

create table if not exists public.payment_initiation_rate_limits (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  action text not null default 'payment_initiation',
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count >= 0),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint payment_initiation_rate_limits_window_unique
    unique (member_id, action, window_start)
);

alter table public.payment_initiation_rate_limits enable row level security;

create index if not exists idx_payment_initiation_rate_limits_member_id
  on public.payment_initiation_rate_limits(member_id);

create index if not exists idx_payment_initiation_rate_limits_window_start
  on public.payment_initiation_rate_limits(window_start);

drop policy if exists "Finance managers can read payment initiation rate limits"
  on public.payment_initiation_rate_limits;
create policy "Finance managers can read payment initiation rate limits"
on public.payment_initiation_rate_limits
for select
to authenticated
using (public.current_user_can_manage_financial_records());

create or replace function public.check_payment_initiation_rate_limit(
  p_member_id uuid,
  p_limit integer default 5,
  p_window_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  is_allowed boolean;
  reset_at timestamptz;
  window_start timestamptz;
begin
  if p_member_id is null then
    raise exception 'member_id is required'
      using errcode = '23502';
  end if;

  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'Rate limit and window seconds must be greater than zero'
      using errcode = '22023';
  end if;

  if auth.role() = 'authenticated'
    and auth.uid() <> p_member_id
    and not public.current_user_can_manage_financial_records()
  then
    raise exception 'Members can only rate-limit their own payment attempts'
      using errcode = '42501';
  end if;

  window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.payment_initiation_rate_limits (
    member_id,
    action,
    window_start,
    request_count,
    updated_at
  )
  values (
    p_member_id,
    'payment_initiation',
    window_start,
    1,
    timezone('utc'::text, now())
  )
  on conflict (member_id, action, window_start)
  do update set
    request_count = public.payment_initiation_rate_limits.request_count + 1,
    updated_at = timezone('utc'::text, now())
  returning request_count into current_count;

  is_allowed := current_count <= p_limit;
  reset_at := window_start + make_interval(secs => p_window_seconds);

  return jsonb_build_object(
    'allowed', is_allowed,
    'limit', p_limit,
    'remaining', greatest(p_limit - current_count, 0),
    'reset_at', reset_at
  );
end;
$$;

revoke all on function public.check_payment_initiation_rate_limit(uuid, integer, integer)
  from public;
grant execute on function public.check_payment_initiation_rate_limit(uuid, integer, integer)
  to authenticated;
grant execute on function public.check_payment_initiation_rate_limit(uuid, integer, integer)
  to service_role;
