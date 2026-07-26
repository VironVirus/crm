-- Adds automated monthly dues, investment plans, member investments, and
-- occasion levies to a database that already ran full_schema_setup.sql.

alter table public.meetings
  add column if not exists late_fee numeric(14,2) not null default 1000 check (late_fee >= 0),
  add column if not exists absence_fee numeric(14,2) not null default 2000 check (absence_fee >= 0);

alter table public.member_charges
  add column if not exists charge_category text;

update public.member_charges
set charge_category = case
  when source_type in ('meeting_late', 'meeting_absence') then 'meeting_penalty'
  else 'manual'
end
where charge_category is null;

alter table public.member_charges
  alter column charge_category set default 'manual',
  alter column charge_category set not null;

alter table public.member_charges
  drop constraint if exists member_charges_category_valid;

alter table public.member_charges
  add constraint member_charges_category_valid check (
    charge_category in ('monthly_due', 'occasion_levy', 'meeting_penalty', 'manual')
  );

create index if not exists idx_member_charges_category_status
  on public.member_charges(charge_category, status);

create table if not exists public.monthly_dues (
  id uuid primary key default gen_random_uuid(),
  period_start date not null unique,
  amount numeric(14,2) not null default 10000 check (amount = 10000),
  due_at timestamptz not null,
  generated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.investment_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) > 0),
  description text,
  projected_return_rate numeric(7,2) check (
    projected_return_rate is null or projected_return_rate >= 0
  ),
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint investment_plan_dates_valid check (
    ends_on is null or starts_on is null or ends_on >= starts_on
  )
);

create table if not exists public.member_investments (
  id uuid primary key default gen_random_uuid(),
  investment_plan_id uuid not null references public.investment_plans(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  invested_at date not null default current_date,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.occasion_levies (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  description text,
  amount numeric(14,2) not null check (amount > 0),
  due_at timestamptz,
  target_scope text not null default 'all_members' check (
    target_scope in ('all_members', 'single_member')
  ),
  target_member_id uuid references public.members(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint occasion_levy_target_valid check (
    (target_scope = 'all_members' and target_member_id is null)
    or
    (target_scope = 'single_member' and target_member_id is not null)
  )
);

alter table public.monthly_dues enable row level security;
alter table public.investment_plans enable row level security;
alter table public.member_investments enable row level security;
alter table public.occasion_levies enable row level security;

create index if not exists idx_member_investments_member_id
  on public.member_investments(member_id);

create index if not exists idx_member_investments_plan_id
  on public.member_investments(investment_plan_id);

create index if not exists idx_occasion_levies_created_at
  on public.occasion_levies(created_at desc);

drop policy if exists "Authenticated users can read monthly dues" on public.monthly_dues;
create policy "Authenticated users can read monthly dues"
on public.monthly_dues for select to authenticated using (true);

drop policy if exists "Admins can manage monthly dues" on public.monthly_dues;
create policy "Admins can manage monthly dues"
on public.monthly_dues for all to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Authenticated users can read investment plans" on public.investment_plans;
create policy "Authenticated users can read investment plans"
on public.investment_plans for select to authenticated using (true);

drop policy if exists "Admins can manage investment plans" on public.investment_plans;
create policy "Admins can manage investment plans"
on public.investment_plans for all to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Members can read their own investments" on public.member_investments;
create policy "Members can read their own investments"
on public.member_investments for select to authenticated
using (auth.uid() = member_id);

drop policy if exists "Admins can manage member investments" on public.member_investments;
create policy "Admins can manage member investments"
on public.member_investments for all to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Members can read applicable occasion levies" on public.occasion_levies;
create policy "Members can read applicable occasion levies"
on public.occasion_levies for select to authenticated
using (target_scope = 'all_members' or target_member_id = auth.uid());

drop policy if exists "Admins can manage occasion levies" on public.occasion_levies;
create policy "Admins can manage occasion levies"
on public.occasion_levies for all to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create or replace function public.generate_monthly_member_dues(
  requested_period date default current_date,
  triggered_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  due_record_id uuid;
  normalized_period date;
  normalized_due_at timestamptz;
begin
  normalized_period := date_trunc('month', requested_period)::date;
  normalized_due_at := (
    normalized_period + interval '1 month' - interval '1 second'
  )::timestamptz;

  insert into public.monthly_dues (amount, due_at, generated_by, period_start)
  values (10000, normalized_due_at, triggered_by, normalized_period)
  on conflict (period_start)
  do update set amount = excluded.amount, due_at = excluded.due_at
  returning id into due_record_id;

  insert into public.member_charges (
    amount,
    charge_category,
    created_by,
    description,
    due_at,
    member_id,
    source_id,
    source_type,
    status,
    title
  )
  select
    10000,
    'monthly_due',
    triggered_by,
    'Automated cooperative dues for ' || to_char(normalized_period, 'FMMonth YYYY') || '.',
    normalized_due_at,
    members.id,
    due_record_id,
    'manual'::public.member_charge_source_type,
    'pending'::public.member_charge_status,
    'Monthly dues - ' || to_char(normalized_period, 'FMMonth YYYY')
  from public.members as members
  join public.profiles as profiles on profiles.id = members.id
  where profiles.status = 'active'
    and profiles.member_number is not null
  on conflict (member_id, source_type, source_id)
  do update set
    amount = excluded.amount,
    charge_category = excluded.charge_category,
    description = excluded.description,
    due_at = excluded.due_at,
    title = excluded.title;

  return due_record_id;
end;
$$;

revoke all on function public.generate_monthly_member_dues(date, uuid) from public;
grant execute on function public.generate_monthly_member_dues(date, uuid) to service_role;

select public.schedule_or_replace_cron_job(
  'monthly-member-dues',
  '10 0 * * *',
  $$select public.generate_monthly_member_dues();$$
);

select public.generate_monthly_member_dues();
