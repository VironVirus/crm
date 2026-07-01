-- Ifemelunma Cooperative Society
-- Production hardening patch for existing Supabase projects.
-- Run this after supabase/sql/full_schema_setup.sql if your database already exists.

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

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_values jsonb,
  new_values jsonb,
  performed_by uuid references public.profiles(id) on delete set null,
  performed_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.audit_logs enable row level security;

create index if not exists idx_audit_logs_table_name
  on public.audit_logs(table_name);

create index if not exists idx_audit_logs_record_id
  on public.audit_logs(record_id);

create index if not exists idx_audit_logs_performed_at
  on public.audit_logs(performed_at desc);

create index if not exists idx_audit_logs_performed_by
  on public.audit_logs(performed_by);

drop policy if exists "Finance managers can read audit logs" on public.audit_logs;
create policy "Finance managers can read audit logs"
on public.audit_logs
for select
to authenticated
using (public.current_user_can_manage_financial_records());

create or replace function public.capture_financial_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  actor_text text;
  new_data jsonb;
  old_data jsonb;
  record_id uuid;
  record_id_text text;
begin
  old_data := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_data := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  record_id_text := coalesce(new_data ->> 'id', old_data ->> 'id');
  actor_text := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    new_data ->> 'created_by',
    new_data ->> 'declared_by',
    new_data ->> 'approved_by',
    new_data ->> 'reviewed_by',
    new_data ->> 'released_by',
    old_data ->> 'created_by',
    old_data ->> 'declared_by',
    old_data ->> 'approved_by',
    old_data ->> 'reviewed_by',
    old_data ->> 'released_by'
  );

  if record_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    record_id := record_id_text::uuid;
  end if;

  if actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    actor_id := actor_text::uuid;
  end if;

  insert into public.audit_logs (
    table_name,
    record_id,
    action,
    old_values,
    new_values,
    performed_by
  )
  values (
    tg_table_schema || '.' || tg_table_name,
    record_id,
    tg_op,
    old_data,
    new_data,
    actor_id
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.capture_financial_audit_log() from public;
grant execute on function public.capture_financial_audit_log() to service_role;

create or replace function public.prevent_journal_entry_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Journal entries cannot be deleted. Set status to voided instead.'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_prevent_journal_entry_delete
  on public.journal_entries;

create trigger trg_prevent_journal_entry_delete
before delete
on public.journal_entries
for each row
execute function public.prevent_journal_entry_delete();

do $$
declare
  financial_table text;
begin
  foreach financial_table in array array[
    'accounts',
    'journal_entries',
    'journal_lines',
    'savings_accounts',
    'savings_transactions',
    'contribution_schedules',
    'share_config',
    'member_shares',
    'share_transactions',
    'dividend_declarations',
    'dividend_payments',
    'loan_products',
    'loan_applications',
    'loans',
    'loan_repayment_schedule',
    'loan_transactions',
    'loan_guarantors',
    'payment_logs'
  ]
  loop
    if to_regclass(format('public.%I', financial_table)) is not null then
      execute format(
        'drop trigger if exists trg_capture_financial_audit_log on public.%I',
        financial_table
      );
      execute format(
        'create trigger trg_capture_financial_audit_log after insert or update or delete on public.%I for each row execute function public.capture_financial_audit_log()',
        financial_table
      );
    end if;
  end loop;
end;
$$;

drop policy if exists "Admins can read all member records" on public.members;
drop policy if exists "Finance managers can read all member records" on public.members;
create policy "Finance managers can read all member records"
on public.members
for select
to authenticated
using (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can read accounts" on public.accounts;
create policy "Finance managers can read accounts"
on public.accounts
for select
to authenticated
using (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can insert accounts" on public.accounts;
create policy "Finance managers can insert accounts"
on public.accounts
for insert
to authenticated
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can update accounts" on public.accounts;
create policy "Finance managers can update accounts"
on public.accounts
for update
to authenticated
using (public.current_user_can_manage_financial_records())
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Users can read journal entries they created" on public.journal_entries;
create policy "Users can read journal entries they created"
on public.journal_entries
for select
to authenticated
using (auth.uid() = created_by);

drop policy if exists "Finance managers can read journal entries" on public.journal_entries;
create policy "Finance managers can read journal entries"
on public.journal_entries
for select
to authenticated
using (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can insert journal entries" on public.journal_entries;
create policy "Finance managers can insert journal entries"
on public.journal_entries
for insert
to authenticated
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can update journal entries" on public.journal_entries;
create policy "Finance managers can update journal entries"
on public.journal_entries
for update
to authenticated
using (public.current_user_can_manage_financial_records())
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Users can read journal lines for their entries" on public.journal_lines;
create policy "Users can read journal lines for their entries"
on public.journal_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.journal_entries
    where journal_entries.id = journal_lines.journal_entry_id
      and journal_entries.created_by = auth.uid()
  )
);

drop policy if exists "Finance managers can read journal lines" on public.journal_lines;
create policy "Finance managers can read journal lines"
on public.journal_lines
for select
to authenticated
using (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can insert journal lines" on public.journal_lines;
create policy "Finance managers can insert journal lines"
on public.journal_lines
for insert
to authenticated
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can update journal lines" on public.journal_lines;
create policy "Finance managers can update journal lines"
on public.journal_lines
for update
to authenticated
using (public.current_user_can_manage_financial_records())
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Admins can read all savings accounts" on public.savings_accounts;
drop policy if exists "Finance managers can read all savings accounts" on public.savings_accounts;
create policy "Finance managers can read all savings accounts"
on public.savings_accounts
for select
to authenticated
using (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can insert savings accounts" on public.savings_accounts;
create policy "Finance managers can insert savings accounts"
on public.savings_accounts
for insert
to authenticated
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can update savings accounts" on public.savings_accounts;
create policy "Finance managers can update savings accounts"
on public.savings_accounts
for update
to authenticated
using (public.current_user_can_manage_financial_records())
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Admins can read all savings transactions" on public.savings_transactions;
drop policy if exists "Finance managers can read all savings transactions" on public.savings_transactions;
create policy "Finance managers can read all savings transactions"
on public.savings_transactions
for select
to authenticated
using (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can insert savings transactions" on public.savings_transactions;
create policy "Finance managers can insert savings transactions"
on public.savings_transactions
for insert
to authenticated
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can update savings transactions" on public.savings_transactions;
create policy "Finance managers can update savings transactions"
on public.savings_transactions
for update
to authenticated
using (public.current_user_can_manage_financial_records())
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Admins can read all member shares" on public.member_shares;
drop policy if exists "Finance managers can read all member shares" on public.member_shares;
create policy "Finance managers can read all member shares"
on public.member_shares
for select
to authenticated
using (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can insert member shares" on public.member_shares;
create policy "Finance managers can insert member shares"
on public.member_shares
for insert
to authenticated
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can update member shares" on public.member_shares;
create policy "Finance managers can update member shares"
on public.member_shares
for update
to authenticated
using (public.current_user_can_manage_financial_records())
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Admins can read all share transactions" on public.share_transactions;
drop policy if exists "Finance managers can read all share transactions" on public.share_transactions;
create policy "Finance managers can read all share transactions"
on public.share_transactions
for select
to authenticated
using (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can insert share transactions" on public.share_transactions;
create policy "Finance managers can insert share transactions"
on public.share_transactions
for insert
to authenticated
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can update share transactions" on public.share_transactions;
create policy "Finance managers can update share transactions"
on public.share_transactions
for update
to authenticated
using (public.current_user_can_manage_financial_records())
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Admins can read all loans" on public.loans;
drop policy if exists "Finance managers can read all loans" on public.loans;
create policy "Finance managers can read all loans"
on public.loans
for select
to authenticated
using (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can insert loans" on public.loans;
create policy "Finance managers can insert loans"
on public.loans
for insert
to authenticated
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can update loans" on public.loans;
create policy "Finance managers can update loans"
on public.loans
for update
to authenticated
using (public.current_user_can_manage_financial_records())
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Admins can read all loan transactions" on public.loan_transactions;
drop policy if exists "Finance managers can read all loan transactions" on public.loan_transactions;
create policy "Finance managers can read all loan transactions"
on public.loan_transactions
for select
to authenticated
using (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can insert loan transactions" on public.loan_transactions;
create policy "Finance managers can insert loan transactions"
on public.loan_transactions
for insert
to authenticated
with check (public.current_user_can_manage_financial_records());

drop policy if exists "Finance managers can update loan transactions" on public.loan_transactions;
create policy "Finance managers can update loan transactions"
on public.loan_transactions
for update
to authenticated
using (public.current_user_can_manage_financial_records())
with check (public.current_user_can_manage_financial_records());

do $$
declare
  missing text[];
begin
  with expected(table_name) as (
    values
      ('members'),
      ('savings_accounts'),
      ('savings_transactions'),
      ('loans'),
      ('loan_transactions'),
      ('member_shares'),
      ('share_transactions'),
      ('journal_entries')
  )
  select array_agg(expected.table_name)
  into missing
  from expected
  join pg_class as relation
    on relation.relname = expected.table_name
  join pg_namespace as namespace
    on namespace.oid = relation.relnamespace
   and namespace.nspname = 'public'
  where relation.relrowsecurity is not true;

  if missing is not null then
    raise exception 'RLS hardening check failed. Tables without RLS: %', missing;
  end if;
end;
$$;

do $$
declare
  missing text[];
begin
  with expected(table_name, policy_name) as (
    values
      ('members', 'Members can read their own member record'),
      ('savings_accounts', 'Members can read their own savings accounts'),
      ('savings_transactions', 'Members can read their own savings transactions'),
      ('loans', 'Members can read their own loans'),
      ('loan_transactions', 'Members can read their own loan transactions'),
      ('member_shares', 'Members can read their own shares'),
      ('share_transactions', 'Members can read their own share transactions'),
      ('journal_entries', 'Users can read journal entries they created'),
      ('savings_accounts', 'Finance managers can insert savings accounts'),
      ('savings_accounts', 'Finance managers can update savings accounts'),
      ('savings_transactions', 'Finance managers can insert savings transactions'),
      ('savings_transactions', 'Finance managers can update savings transactions'),
      ('loans', 'Finance managers can insert loans'),
      ('loans', 'Finance managers can update loans'),
      ('loan_transactions', 'Finance managers can insert loan transactions'),
      ('loan_transactions', 'Finance managers can update loan transactions'),
      ('member_shares', 'Finance managers can insert member shares'),
      ('member_shares', 'Finance managers can update member shares'),
      ('share_transactions', 'Finance managers can insert share transactions'),
      ('share_transactions', 'Finance managers can update share transactions'),
      ('journal_entries', 'Finance managers can insert journal entries'),
      ('journal_entries', 'Finance managers can update journal entries')
  )
  select array_agg(expected.table_name || ':' || expected.policy_name)
  into missing
  from expected
  where not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = expected.table_name
      and policyname = expected.policy_name
  );

  if missing is not null then
    raise exception 'RLS hardening check failed. Missing policies: %', missing;
  end if;
end;
$$;
