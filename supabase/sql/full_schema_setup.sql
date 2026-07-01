-- Ifemelumma Cooperative Society
-- Consolidated Supabase setup script for manual SQL editor use.
-- This is the main schema file to run for full setup.
-- Future base schema additions should be merged into this file.
-- Separate SQL files should only be used for patches or one-off actions.
-- This file combines the base schema, auth/profile provisioning,
-- member registration, accounting ledger, savings/contributions,
-- and loan management setup.

create schema if not exists extensions;
create schema if not exists private;

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net;

do $$
begin
  if exists (
    select 1
    from pg_available_extensions
    where name = 'vault'
  ) then
    execute 'create extension if not exists vault';
  end if;
end;
$$;

revoke all on schema private from public;

create table if not exists private.app_runtime_config (
  config_key text primary key,
  config_value text not null,
  description text,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

revoke all on private.app_runtime_config from public;

create or replace function public.enable_row_level_security_on_public_tables()
returns event_trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  command record;
begin
  for command in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name
    from pg_event_trigger_ddl_commands() as ddl_command
    join pg_class as relation
      on relation.oid = ddl_command.objid
    join pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where ddl_command.command_tag = 'CREATE TABLE'
      and relation.relkind = 'r'
      and namespace.nspname = 'public'
  loop
    execute format(
      'alter table %I.%I enable row level security',
      command.schema_name,
      command.table_name
    );
  end loop;
end;
$$;

drop event trigger if exists on_public_table_create_enable_rls;

create event trigger on_public_table_create_enable_rls
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.enable_row_level_security_on_public_tables();

do $$
declare
  existing_table record;
begin
  for existing_table in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'alter table %I.%I enable row level security',
      existing_table.schemaname,
      existing_table.tablename
    );
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'roles'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.roles as enum (
      'admin',
      'loan_officer',
      'treasurer',
      'member'
    );
  end if;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  role public.roles not null default 'member',
  member_number text unique,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'suspended')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.profiles enable row level security;

create or replace function public.current_user_is_admin()
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
      and role = 'admin'
  );
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_is_admin() to service_role;

drop policy if exists "Members can read their own profile" on public.profiles;
create policy "Members can read their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
on public.profiles
for select
to authenticated
using (public.current_user_is_admin());

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'account_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.account_type as enum (
      'asset',
      'liability',
      'equity',
      'income',
      'expense'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'journal_entry_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.journal_entry_status as enum (
      'draft',
      'posted',
      'voided'
    );
  end if;
end;
$$;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text not null unique,
  account_name text not null,
  account_type public.account_type not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  reference_number text not null unique,
  description text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  status public.journal_entry_status not null default 'draft',
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  debit_amount numeric(14,2) not null default 0,
  credit_amount numeric(14,2) not null default 0,
  narration text,
  constraint journal_lines_non_negative_amounts
    check (debit_amount >= 0 and credit_amount >= 0),
  constraint journal_lines_single_sided_amount
    check (debit_amount = 0 or credit_amount = 0),
  constraint journal_lines_has_value
    check (debit_amount > 0 or credit_amount > 0)
);

alter table public.accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;

create index if not exists idx_accounts_account_type
  on public.accounts(account_type);

create index if not exists idx_accounts_is_active
  on public.accounts(is_active);

create index if not exists idx_journal_entries_entry_date
  on public.journal_entries(entry_date);

create index if not exists idx_journal_entries_status
  on public.journal_entries(status);

create index if not exists idx_journal_lines_journal_entry_id
  on public.journal_lines(journal_entry_id);

create index if not exists idx_journal_lines_account_id
  on public.journal_lines(account_id);

create or replace function public.validate_posted_journal_entry_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  debit_total numeric(14,2);
  credit_total numeric(14,2);
begin
  if new.status <> 'posted' then
    return new;
  end if;

  select
    coalesce(sum(debit_amount), 0),
    coalesce(sum(credit_amount), 0)
  into debit_total, credit_total
  from public.journal_lines
  where journal_entry_id = new.id;

  if debit_total = 0 and credit_total = 0 then
    raise exception
      'Posted journal entry % must have at least one debit and credit line before posting',
      new.reference_number
      using errcode = '23514';
  end if;

  if debit_total <> credit_total then
    raise exception
      'Posted journal entry % is not balanced. Debits: %, Credits: %',
      new.reference_number,
      debit_total,
      credit_total
      using errcode = '23514';
  end if;

  new.total_amount := debit_total;

  return new;
end;
$$;

drop trigger if exists trg_validate_posted_journal_entry_balance
  on public.journal_entries;

create trigger trg_validate_posted_journal_entry_balance
before insert or update
on public.journal_entries
for each row
execute function public.validate_posted_journal_entry_balance();

create or replace function public.prevent_changes_to_posted_journal_lines()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_status public.journal_entry_status;
  target_entry_id uuid;
begin
  if tg_op = 'DELETE' then
    target_entry_id := old.journal_entry_id;
  else
    target_entry_id := new.journal_entry_id;
  end if;

  select status
  into entry_status
  from public.journal_entries
  where id = target_entry_id;

  if entry_status = 'posted' then
    raise exception
      'Posted journal entry lines cannot be modified. Create a reversing or adjustment entry instead.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_changes_to_posted_journal_lines
  on public.journal_lines;

create trigger trg_prevent_changes_to_posted_journal_lines
before insert or update or delete
on public.journal_lines
for each row
execute function public.prevent_changes_to_posted_journal_lines();

insert into public.accounts (
  account_code,
  account_name,
  account_type,
  description
)
values
  ('1000', 'Cash', 'asset', 'Cash on hand and bank balances'),
  ('1100', 'Loan Receivable', 'asset', 'Outstanding member loan principal'),
  ('2100', 'Member Savings', 'liability', 'Member savings balances held by the society'),
  ('2200', 'Dividend Payable', 'liability', 'Declared dividends due to members'),
  ('3000', 'Share Capital', 'equity', 'Member share capital contributions'),
  ('4100', 'Interest Income', 'income', 'Interest earned on cooperative lending')
on conflict (account_code) do update
set
  account_name = excluded.account_name,
  account_type = excluded.account_type,
  description = excluded.description,
  is_active = true;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    email,
    phone,
    role,
    member_number,
    status
  )
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'member',
    null,
    'active'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = coalesce(public.profiles.phone, excluded.phone),
    status = coalesce(public.profiles.status, 'active');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

insert into public.profiles (
  id,
  full_name,
  email,
  phone,
  role,
  member_number,
  status
)
select
  auth_user.id,
  coalesce(
    nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
    split_part(auth_user.email, '@', 1)
  ),
  auth_user.email,
  nullif(auth_user.raw_user_meta_data ->> 'phone', ''),
  'member',
  null,
  'active'
from auth.users as auth_user
where not exists (
  select 1
  from public.profiles
  where profiles.id = auth_user.id
);

create table if not exists public.members (
  id uuid primary key references public.profiles(id) on delete cascade,
  date_of_birth date not null,
  address text not null,
  occupation text not null,
  next_of_kin_name text not null,
  next_of_kin_phone text not null,
  next_of_kin_relationship text not null,
  national_id_path text not null,
  passport_photo_path text not null,
  utility_bill_path text not null,
  onboarding_status text not null default 'pending'
    check (onboarding_status in ('pending', 'registered')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.members enable row level security;

create index if not exists idx_members_onboarding_status
  on public.members(onboarding_status);

drop policy if exists "Members can read their own member record" on public.members;
create policy "Members can read their own member record"
on public.members
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Admins can read all member records" on public.members;
create policy "Admins can read all member records"
on public.members
for select
to authenticated
using (public.current_user_is_admin());

create sequence if not exists public.member_number_sequence
  start with 1001
  increment by 1
  minvalue 1001;

create or replace function public.assign_member_number(target_profile_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_member_number text;
  generated_member_number text;
begin
  if target_profile_id is null then
    raise exception 'target_profile_id is required'
      using errcode = '23502';
  end if;

  select member_number
  into existing_member_number
  from public.profiles
  where id = target_profile_id
  for update;

  if not found then
    raise exception 'No profile found for %', target_profile_id
      using errcode = 'P0002';
  end if;

  perform 1
  from public.members
  where id = target_profile_id;

  if not found then
    raise exception 'No member registration found for %', target_profile_id
      using errcode = 'P0002';
  end if;

  if existing_member_number is not null then
    return existing_member_number;
  end if;

  generated_member_number := format(
    'IFS-%s-%s',
    to_char(current_date, 'YYYY'),
    lpad(nextval('public.member_number_sequence')::text, 5, '0')
  );

  update public.profiles
  set member_number = generated_member_number
  where id = target_profile_id;

  update public.members
  set onboarding_status = 'registered'
  where id = target_profile_id;

  return generated_member_number;
end;
$$;

revoke all on function public.assign_member_number(uuid) from public;
grant execute on function public.assign_member_number(uuid) to authenticated;
grant execute on function public.assign_member_number(uuid) to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'member-kyc',
  'member-kyc',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members can read their own KYC files" on storage.objects;
create policy "Members can read their own KYC files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'member-kyc'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Admins can read all KYC files" on storage.objects;
create policy "Admins can read all KYC files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'member-kyc'
  and public.current_user_is_admin()
);

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'savings_account_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.savings_account_type as enum (
      'mandatory',
      'voluntary',
      'fixed_deposit'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'savings_account_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.savings_account_status as enum (
      'active',
      'closed'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'savings_transaction_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.savings_transaction_type as enum (
      'deposit',
      'withdrawal',
      'interest'
    );
  end if;
end;
$$;

create table if not exists public.savings_accounts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  account_type public.savings_account_type not null,
  balance numeric(14,2) not null default 0 check (balance >= 0),
  interest_rate numeric(5,2) not null default 0 check (interest_rate >= 0),
  maturity_date date,
  status public.savings_account_status not null default 'active',
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint savings_accounts_fixed_deposit_maturity_required
    check (
      account_type <> 'fixed_deposit'
      or maturity_date is not null
    )
);

create table if not exists public.savings_transactions (
  id uuid primary key default gen_random_uuid(),
  savings_account_id uuid not null references public.savings_accounts(id) on delete restrict,
  transaction_type public.savings_transaction_type not null,
  amount numeric(14,2) not null check (amount > 0),
  balance_after numeric(14,2) not null check (balance_after >= 0),
  payment_reference text,
  narration text,
  transaction_date timestamptz not null default timezone('utc'::text, now()),
  created_by uuid not null references public.profiles(id) on delete restrict
);

create table if not exists public.contribution_schedules (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  monthly_amount numeric(14,2) not null check (monthly_amount > 0),
  due_day integer not null check (due_day between 1 and 31),
  start_date date not null,
  is_active boolean not null default true
);

alter table public.savings_accounts enable row level security;
alter table public.savings_transactions enable row level security;
alter table public.contribution_schedules enable row level security;

create index if not exists idx_savings_accounts_member_id
  on public.savings_accounts(member_id);

create index if not exists idx_savings_accounts_status
  on public.savings_accounts(status);

create index if not exists idx_savings_transactions_account_id
  on public.savings_transactions(savings_account_id);

create index if not exists idx_savings_transactions_type
  on public.savings_transactions(transaction_type);

create index if not exists idx_savings_transactions_date
  on public.savings_transactions(transaction_date);

create index if not exists idx_contribution_schedules_member_id
  on public.contribution_schedules(member_id);

create index if not exists idx_contribution_schedules_active
  on public.contribution_schedules(is_active);

drop policy if exists "Members can read their own savings accounts" on public.savings_accounts;
create policy "Members can read their own savings accounts"
on public.savings_accounts
for select
to authenticated
using (auth.uid() = member_id);

drop policy if exists "Admins can read all savings accounts" on public.savings_accounts;
create policy "Admins can read all savings accounts"
on public.savings_accounts
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Members can read their own savings transactions" on public.savings_transactions;
create policy "Members can read their own savings transactions"
on public.savings_transactions
for select
to authenticated
using (
  exists (
    select 1
    from public.savings_accounts
    where savings_accounts.id = savings_transactions.savings_account_id
      and savings_accounts.member_id = auth.uid()
  )
);

drop policy if exists "Admins can read all savings transactions" on public.savings_transactions;
create policy "Admins can read all savings transactions"
on public.savings_transactions
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Members can read their own contribution schedules" on public.contribution_schedules;
create policy "Members can read their own contribution schedules"
on public.contribution_schedules
for select
to authenticated
using (auth.uid() = member_id);

drop policy if exists "Admins can read all contribution schedules" on public.contribution_schedules;
create policy "Admins can read all contribution schedules"
on public.contribution_schedules
for select
to authenticated
using (public.current_user_is_admin());

insert into public.accounts (
  account_code,
  account_name,
  account_type,
  description
)
values
  (
    '5200',
    'Savings Interest Expense',
    'expense',
    'Interest expense recognised on member savings and fixed deposits'
  )
on conflict (account_code) do update
set
  account_name = excluded.account_name,
  account_type = excluded.account_type,
  description = excluded.description,
  is_active = true;

create or replace function public.apply_savings_transaction_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance numeric(14,2);
  current_status public.savings_account_status;
begin
  select balance, status
  into current_balance, current_status
  from public.savings_accounts
  where id = new.savings_account_id
  for update;

  if not found then
    raise exception
      'Savings account % does not exist.',
      new.savings_account_id
      using errcode = 'P0002';
  end if;

  if current_status <> 'active' then
    raise exception
      'Savings account % is not active.',
      new.savings_account_id
      using errcode = '23514';
  end if;

  if new.transaction_type in ('deposit', 'interest') then
    new.balance_after := current_balance + new.amount;
  elsif new.transaction_type = 'withdrawal' then
    if current_balance < new.amount then
      raise exception
        'Insufficient savings balance. Available: %, attempted withdrawal: %',
        current_balance,
        new.amount
        using errcode = '23514';
    end if;

    new.balance_after := current_balance - new.amount;
  else
    raise exception
      'Unsupported savings transaction type: %',
      new.transaction_type
      using errcode = '23514';
  end if;

  update public.savings_accounts
  set balance = new.balance_after
  where id = new.savings_account_id;

  return new;
end;
$$;

drop trigger if exists trg_apply_savings_transaction_balance
  on public.savings_transactions;

create trigger trg_apply_savings_transaction_balance
before insert
on public.savings_transactions
for each row
execute function public.apply_savings_transaction_balance();

create or replace function public.post_savings_transaction_journal_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cash_account_id uuid;
  member_savings_account_id uuid;
  savings_interest_expense_account_id uuid;
  journal_entry_id uuid;
  debit_account_id uuid;
  credit_account_id uuid;
  entry_description text;
begin
  select id
  into cash_account_id
  from public.accounts
  where account_code = '1000'
    and is_active = true
  limit 1;

  select id
  into member_savings_account_id
  from public.accounts
  where account_code = '2100'
    and is_active = true
  limit 1;

  select id
  into savings_interest_expense_account_id
  from public.accounts
  where account_code = '5200'
    and is_active = true
  limit 1;

  if cash_account_id is null then
    raise exception 'Cash account (1000) is not configured.'
      using errcode = 'P0002';
  end if;

  if member_savings_account_id is null then
    raise exception 'Member Savings account (2100) is not configured.'
      using errcode = 'P0002';
  end if;

  if new.transaction_type = 'deposit' then
    debit_account_id := cash_account_id;
    credit_account_id := member_savings_account_id;
    entry_description := format(
      'Savings deposit for account %s',
      new.savings_account_id
    );
  elsif new.transaction_type = 'withdrawal' then
    debit_account_id := member_savings_account_id;
    credit_account_id := cash_account_id;
    entry_description := format(
      'Savings withdrawal for account %s',
      new.savings_account_id
    );
  elsif new.transaction_type = 'interest' then
    if savings_interest_expense_account_id is null then
      raise exception 'Savings Interest Expense account (5200) is not configured.'
        using errcode = 'P0002';
    end if;

    debit_account_id := savings_interest_expense_account_id;
    credit_account_id := member_savings_account_id;
    entry_description := format(
      'Savings interest accrual for account %s',
      new.savings_account_id
    );
  else
    raise exception
      'Unsupported savings transaction type: %',
      new.transaction_type
      using errcode = '23514';
  end if;

  insert into public.journal_entries (
    entry_date,
    reference_number,
    description,
    created_by,
    total_amount,
    status
  )
  values (
    new.transaction_date::date,
    'SAV-' || replace(new.id::text, '-', ''),
    entry_description,
    new.created_by,
    new.amount,
    'draft'
  )
  returning id into journal_entry_id;

  insert into public.journal_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    narration
  )
  values
    (
      journal_entry_id,
      debit_account_id,
      new.amount,
      0,
      coalesce(new.narration, entry_description)
    ),
    (
      journal_entry_id,
      credit_account_id,
      0,
      new.amount,
      coalesce(new.narration, entry_description)
    );

  update public.journal_entries
  set status = 'posted'
  where id = journal_entry_id;

  return new;
end;
$$;

drop trigger if exists trg_post_savings_transaction_journal_entry
  on public.savings_transactions;

create trigger trg_post_savings_transaction_journal_entry
after insert
on public.savings_transactions
for each row
execute function public.post_savings_transaction_journal_entry();

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'share_transaction_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.share_transaction_type as enum (
      'purchase',
      'transfer_in',
      'transfer_out'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'dividend_declaration_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.dividend_declaration_status as enum (
      'declared',
      'paid'
    );
  end if;
end;
$$;

create table if not exists public.share_config (
  id boolean primary key default true check (id),
  share_value numeric(14,2) not null check (share_value > 0),
  minimum_shares integer not null check (minimum_shares > 0),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.member_shares (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members(id) on delete cascade,
  total_shares integer not null default 0 check (total_shares >= 0),
  total_value numeric(14,2) not null default 0 check (total_value >= 0),
  last_updated timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.share_transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  transaction_type public.share_transaction_type not null,
  shares_count integer not null check (shares_count > 0),
  amount numeric(14,2) not null check (amount > 0),
  payment_reference text,
  transaction_date timestamptz not null default timezone('utc'::text, now()),
  created_by uuid not null references public.profiles(id) on delete restrict,
  notes text
);

create table if not exists public.dividend_declarations (
  id uuid primary key default gen_random_uuid(),
  financial_year text not null unique
    check (char_length(trim(financial_year)) > 0),
  total_profit numeric(14,2) not null check (total_profit > 0),
  dividend_per_share numeric(14,4) not null default 0
    check (dividend_per_share >= 0),
  declaration_date date not null default current_date,
  payment_date date,
  status public.dividend_declaration_status not null default 'declared',
  declared_by uuid not null references public.profiles(id) on delete restrict
);

create table if not exists public.dividend_payments (
  id uuid primary key default gen_random_uuid(),
  dividend_declaration_id uuid not null
    references public.dividend_declarations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  shares_at_declaration integer not null check (shares_at_declaration >= 0),
  dividend_amount numeric(14,2) not null check (dividend_amount >= 0),
  paid_at timestamptz,
  payment_reference text,
  constraint dividend_payments_declaration_member_unique
    unique (dividend_declaration_id, member_id)
);

alter table public.share_config enable row level security;
alter table public.member_shares enable row level security;
alter table public.share_transactions enable row level security;
alter table public.dividend_declarations enable row level security;
alter table public.dividend_payments enable row level security;

create index if not exists idx_member_shares_member_id
  on public.member_shares(member_id);

create index if not exists idx_member_shares_total_shares
  on public.member_shares(total_shares);

create index if not exists idx_share_transactions_member_id
  on public.share_transactions(member_id);

create index if not exists idx_share_transactions_type
  on public.share_transactions(transaction_type);

create index if not exists idx_share_transactions_transaction_date
  on public.share_transactions(transaction_date);

create index if not exists idx_dividend_declarations_financial_year
  on public.dividend_declarations(financial_year);

create index if not exists idx_dividend_declarations_status
  on public.dividend_declarations(status);

create index if not exists idx_dividend_payments_declaration_id
  on public.dividend_payments(dividend_declaration_id);

create index if not exists idx_dividend_payments_member_id
  on public.dividend_payments(member_id);

drop policy if exists "Authenticated users can read share configuration" on public.share_config;
create policy "Authenticated users can read share configuration"
on public.share_config
for select
to authenticated
using (true);

drop policy if exists "Members can read their own shares" on public.member_shares;
create policy "Members can read their own shares"
on public.member_shares
for select
to authenticated
using (auth.uid() = member_id);

drop policy if exists "Admins can read all member shares" on public.member_shares;
create policy "Admins can read all member shares"
on public.member_shares
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Members can read their own share transactions" on public.share_transactions;
create policy "Members can read their own share transactions"
on public.share_transactions
for select
to authenticated
using (auth.uid() = member_id);

drop policy if exists "Admins can read all share transactions" on public.share_transactions;
create policy "Admins can read all share transactions"
on public.share_transactions
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Authenticated users can read dividend declarations" on public.dividend_declarations;
create policy "Authenticated users can read dividend declarations"
on public.dividend_declarations
for select
to authenticated
using (true);

drop policy if exists "Members can read their own dividend payments" on public.dividend_payments;
create policy "Members can read their own dividend payments"
on public.dividend_payments
for select
to authenticated
using (auth.uid() = member_id);

drop policy if exists "Admins can read all dividend payments" on public.dividend_payments;
create policy "Admins can read all dividend payments"
on public.dividend_payments
for select
to authenticated
using (public.current_user_is_admin());

insert into public.share_config (
  id,
  share_value,
  minimum_shares
)
values (
  true,
  1000,
  1
)
on conflict (id) do nothing;

insert into public.member_shares (
  member_id,
  total_shares,
  total_value
)
select
  members.id,
  0,
  0
from public.members
on conflict (member_id) do nothing;

create or replace function public.initialize_member_shares_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.member_shares (
    member_id,
    total_shares,
    total_value
  )
  values (
    new.id,
    0,
    0
  )
  on conflict (member_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_initialize_member_shares_record
  on public.members;

create trigger trg_initialize_member_shares_record
after insert
on public.members
for each row
execute function public.initialize_member_shares_record();

create or replace function public.refresh_member_share_values_from_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.member_shares
  set
    total_value = round(total_shares * new.share_value, 2),
    last_updated = timezone('utc'::text, now());

  return new;
end;
$$;

drop trigger if exists trg_refresh_member_share_values_from_config
  on public.share_config;

create trigger trg_refresh_member_share_values_from_config
after update of share_value
on public.share_config
for each row
execute function public.refresh_member_share_values_from_config();

create or replace function public.apply_share_transaction_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_share_value numeric(14,2);
  current_total_shares integer;
  updated_total_shares integer;
  expected_amount numeric(14,2);
begin
  select share_value
  into current_share_value
  from public.share_config
  limit 1;

  if current_share_value is null then
    raise exception 'Share configuration is not set.'
      using errcode = 'P0002';
  end if;

  expected_amount := round(new.shares_count * current_share_value, 2);

  if new.amount <> expected_amount then
    raise exception
      'Share transaction amount must equal shares_count multiplied by the configured share value.'
      using errcode = '23514';
  end if;

  insert into public.member_shares (
    member_id,
    total_shares,
    total_value
  )
  values (
    new.member_id,
    0,
    0
  )
  on conflict (member_id) do nothing;

  select total_shares
  into current_total_shares
  from public.member_shares
  where member_id = new.member_id
  for update;

  if new.transaction_type in ('purchase', 'transfer_in') then
    updated_total_shares := current_total_shares + new.shares_count;
  elsif new.transaction_type = 'transfer_out' then
    if current_total_shares < new.shares_count then
      raise exception
        'Insufficient shares to complete this transfer. Available: %, attempted: %',
        current_total_shares,
        new.shares_count
        using errcode = '23514';
    end if;

    updated_total_shares := current_total_shares - new.shares_count;
  else
    raise exception
      'Unsupported share transaction type: %',
      new.transaction_type
      using errcode = '23514';
  end if;

  update public.member_shares
  set
    total_shares = updated_total_shares,
    total_value = round(updated_total_shares * current_share_value, 2),
    last_updated = timezone('utc'::text, now())
  where member_id = new.member_id;

  return new;
end;
$$;

drop trigger if exists trg_apply_share_transaction_effects
  on public.share_transactions;

create trigger trg_apply_share_transaction_effects
before insert
on public.share_transactions
for each row
execute function public.apply_share_transaction_effects();

create or replace function public.transfer_member_shares(
  p_from_member_id uuid,
  p_to_member_id uuid,
  p_shares_count integer,
  p_payment_reference text,
  p_created_by uuid,
  p_notes text
)
returns table (
  transfer_out_id uuid,
  transfer_in_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_share_value numeric(14,2);
  transfer_amount numeric(14,2);
  created_transfer_out_id uuid;
  created_transfer_in_id uuid;
begin
  if p_from_member_id = p_to_member_id then
    raise exception 'Shares can only be transferred between different members.'
      using errcode = '23514';
  end if;

  if p_shares_count <= 0 then
    raise exception 'Transfer share count must be greater than zero.'
      using errcode = '23514';
  end if;

  select share_value
  into current_share_value
  from public.share_config
  limit 1;

  if current_share_value is null then
    raise exception 'Share configuration is not set.'
      using errcode = 'P0002';
  end if;

  transfer_amount := round(p_shares_count * current_share_value, 2);

  insert into public.share_transactions (
    member_id,
    transaction_type,
    shares_count,
    amount,
    payment_reference,
    created_by,
    notes
  )
  values (
    p_from_member_id,
    'transfer_out',
    p_shares_count,
    transfer_amount,
    p_payment_reference,
    p_created_by,
    coalesce(p_notes, 'Share transfer out')
  )
  returning id into created_transfer_out_id;

  insert into public.share_transactions (
    member_id,
    transaction_type,
    shares_count,
    amount,
    payment_reference,
    created_by,
    notes
  )
  values (
    p_to_member_id,
    'transfer_in',
    p_shares_count,
    transfer_amount,
    p_payment_reference,
    p_created_by,
    coalesce(p_notes, 'Share transfer in')
  )
  returning id into created_transfer_in_id;

  return query
  select created_transfer_out_id, created_transfer_in_id;
end;
$$;

create or replace function public.post_share_purchase_journal_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cash_account_id uuid;
  share_capital_account_id uuid;
  journal_entry_id uuid;
  entry_description text;
begin
  if new.transaction_type <> 'purchase' then
    return new;
  end if;

  select id
  into cash_account_id
  from public.accounts
  where account_code = '1000'
    and is_active = true
  limit 1;

  select id
  into share_capital_account_id
  from public.accounts
  where account_code = '3000'
    and is_active = true
  limit 1;

  if cash_account_id is null then
    raise exception 'Cash account (1000) is not configured.'
      using errcode = 'P0002';
  end if;

  if share_capital_account_id is null then
    raise exception 'Share Capital account (3000) is not configured.'
      using errcode = 'P0002';
  end if;

  entry_description := format(
    'Share purchase for member %s',
    new.member_id
  );

  insert into public.journal_entries (
    entry_date,
    reference_number,
    description,
    created_by,
    total_amount,
    status
  )
  values (
    new.transaction_date::date,
    'SHARE-PUR-' || replace(new.id::text, '-', ''),
    entry_description,
    new.created_by,
    new.amount,
    'draft'
  )
  returning id into journal_entry_id;

  insert into public.journal_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    narration
  )
  values
    (
      journal_entry_id,
      cash_account_id,
      new.amount,
      0,
      coalesce(new.payment_reference, new.notes, entry_description)
    ),
    (
      journal_entry_id,
      share_capital_account_id,
      0,
      new.amount,
      coalesce(new.payment_reference, new.notes, entry_description)
    );

  update public.journal_entries
  set status = 'posted'
  where id = journal_entry_id;

  return new;
end;
$$;

drop trigger if exists trg_post_share_purchase_journal_entry
  on public.share_transactions;

create trigger trg_post_share_purchase_journal_entry
after insert
on public.share_transactions
for each row
execute function public.post_share_purchase_journal_entry();

create or replace function public.prepare_dividend_declaration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total_outstanding_shares integer;
begin
  select coalesce(sum(total_shares), 0)
  into total_outstanding_shares
  from public.member_shares;

  if total_outstanding_shares <= 0 then
    raise exception 'Dividend declarations require at least one issued share.'
      using errcode = '23514';
  end if;

  new.dividend_per_share := round(new.total_profit / total_outstanding_shares, 4);

  return new;
end;
$$;

drop trigger if exists trg_prepare_dividend_declaration
  on public.dividend_declarations;

create trigger trg_prepare_dividend_declaration
before insert
on public.dividend_declarations
for each row
execute function public.prepare_dividend_declaration();

create or replace function public.refresh_dividend_payment_rows_for_declaration(
  p_dividend_declaration_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  declaration_record record;
  total_outstanding_shares integer;
  inserted_payment_count integer := 0;
begin
  if p_dividend_declaration_id is null then
    raise exception 'p_dividend_declaration_id is required.'
      using errcode = '23502';
  end if;

  select
    id,
    total_profit,
    status
  into declaration_record
  from public.dividend_declarations
  where id = p_dividend_declaration_id
  for update;

  if not found then
    raise exception 'Dividend declaration % could not be found.', p_dividend_declaration_id
      using errcode = 'P0002';
  end if;

  if declaration_record.status = 'paid' then
    raise exception 'Paid dividend declarations cannot be recalculated.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.dividend_payments
    where dividend_declaration_id = p_dividend_declaration_id
      and paid_at is not null
  ) then
    raise exception 'Dividend payments have already been marked as paid and cannot be rebuilt automatically.'
      using errcode = '23514';
  end if;

  select coalesce(sum(total_shares), 0)
  into total_outstanding_shares
  from public.member_shares
  where total_shares > 0;

  if total_outstanding_shares <= 0 then
    raise exception 'Dividend declarations require at least one issued share.'
      using errcode = '23514';
  end if;

  update public.dividend_declarations
  set dividend_per_share = round(declaration_record.total_profit / total_outstanding_shares, 4)
  where id = p_dividend_declaration_id;

  delete from public.dividend_payments
  where dividend_declaration_id = p_dividend_declaration_id;

  with inserted_rows as (
    insert into public.dividend_payments (
      dividend_declaration_id,
      member_id,
      shares_at_declaration,
      dividend_amount
    )
    with member_share_base as (
      select
        member_id,
        total_shares,
        round(
          total_shares * (
            select dividend_per_share
            from public.dividend_declarations
            where id = p_dividend_declaration_id
          ),
          2
        ) as provisional_amount,
        row_number() over (order by member_id) as row_position,
        count(*) over () as total_rows
      from public.member_shares
      where total_shares > 0
    ),
    member_share_allocations as (
      select
        member_id,
        total_shares,
        case
          when row_position = total_rows then
            round(
              declaration_record.total_profit - coalesce(
                sum(provisional_amount) over (
                  order by row_position
                  rows between unbounded preceding and 1 preceding
                ),
                0
              ),
              2
            )
          else provisional_amount
        end as dividend_amount
      from member_share_base
    )
    select
      p_dividend_declaration_id,
      member_id,
      total_shares,
      dividend_amount
    from member_share_allocations
    returning id
  )
  select count(*)
  into inserted_payment_count
  from inserted_rows;

  return inserted_payment_count;
end;
$$;

create or replace function public.generate_dividend_payment_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_dividend_payment_rows_for_declaration(new.id);
  return new;
end;
$$;

drop trigger if exists trg_generate_dividend_payment_rows
  on public.dividend_declarations;

create trigger trg_generate_dividend_payment_rows
after insert
on public.dividend_declarations
for each row
execute function public.generate_dividend_payment_rows();

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'loan_interest_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.loan_interest_type as enum (
      'flat',
      'reducing_balance'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'loan_application_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.loan_application_status as enum (
      'draft',
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'disbursed',
      'closed'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'loan_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.loan_status as enum (
      'active',
      'completed',
      'defaulted'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'loan_repayment_schedule_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.loan_repayment_schedule_status as enum (
      'pending',
      'paid',
      'overdue',
      'partial'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'loan_transaction_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.loan_transaction_type as enum (
      'disbursement',
      'repayment',
      'penalty'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'member_payment_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.member_payment_type as enum (
      'savings_deposit',
      'loan_repayment',
      'share_purchase'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'payment_log_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.payment_log_status as enum (
      'received',
      'processed',
      'duplicate',
      'invalid_signature',
      'verification_failed',
      'handler_failed'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'notification_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.notification_type as enum (
      'loan_approved',
      'loan_rejected',
      'payment_received',
      'guarantor_invite',
      'due_reminder',
      'dividend_paid'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'loan_guarantor_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.loan_guarantor_status as enum (
      'invited',
      'accepted',
      'declined'
    );
  end if;
end;
$$;

create table if not exists public.loan_products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  interest_rate numeric(5,2) not null check (interest_rate >= 0),
  interest_type public.loan_interest_type not null,
  min_amount numeric(14,2) not null check (min_amount > 0),
  max_amount numeric(14,2) not null check (max_amount >= min_amount),
  min_tenure_months integer not null check (min_tenure_months > 0),
  max_tenure_months integer not null check (max_tenure_months >= min_tenure_months),
  max_loan_to_savings_ratio numeric(8,2) not null check (max_loan_to_savings_ratio > 0),
  is_active boolean not null default true
);

create table if not exists public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  loan_product_id uuid not null references public.loan_products(id) on delete restrict,
  amount_requested numeric(14,2) not null check (amount_requested > 0),
  tenure_months integer not null check (tenure_months > 0),
  purpose text not null,
  status public.loan_application_status not null default 'draft',
  applied_at timestamptz not null default timezone('utc'::text, now()),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  rejection_reason text
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.loan_applications(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  principal_amount numeric(14,2) not null check (principal_amount > 0),
  interest_rate numeric(5,2) not null check (interest_rate >= 0),
  tenure_months integer not null check (tenure_months > 0),
  monthly_repayment numeric(14,2) not null default 0 check (monthly_repayment >= 0),
  total_repayable numeric(14,2) not null default 0 check (total_repayable >= 0),
  amount_disbursed numeric(14,2) not null default 0
    check (amount_disbursed >= 0 and amount_disbursed <= principal_amount),
  disbursed_at timestamptz,
  maturity_date date,
  outstanding_balance numeric(14,2) not null default 0 check (outstanding_balance >= 0),
  status public.loan_status not null default 'active'
);

create table if not exists public.loan_repayment_schedule (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  due_date date not null,
  principal_due numeric(14,2) not null check (principal_due >= 0),
  interest_due numeric(14,2) not null check (interest_due >= 0),
  total_due numeric(14,2) not null,
  amount_paid numeric(14,2) not null default 0
    check (amount_paid >= 0 and amount_paid <= total_due),
  paid_at timestamptz,
  status public.loan_repayment_schedule_status not null default 'pending',
  constraint loan_repayment_schedule_total_matches_components
    check (total_due = principal_due + interest_due),
  constraint loan_repayment_schedule_total_positive
    check (total_due > 0),
  constraint loan_repayment_schedule_due_unique
    unique (loan_id, due_date)
);

create table if not exists public.loan_transactions (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete restrict,
  transaction_type public.loan_transaction_type not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_reference text,
  transaction_date timestamptz not null default timezone('utc'::text, now()),
  created_by uuid not null references public.profiles(id) on delete restrict
);

create table if not exists public.loan_guarantors (
  id uuid primary key default gen_random_uuid(),
  loan_application_id uuid not null references public.loan_applications(id) on delete cascade,
  guarantor_member_id uuid not null references public.members(id) on delete restrict,
  status public.loan_guarantor_status not null default 'invited',
  invited_at timestamptz not null default timezone('utc'::text, now()),
  responded_at timestamptz,
  liability_amount numeric(14,2) not null check (liability_amount > 0),
  released_at timestamptz,
  released_by uuid references public.profiles(id) on delete restrict,
  constraint loan_guarantors_application_member_unique
    unique (loan_application_id, guarantor_member_id),
  constraint loan_guarantors_release_consistency
    check (released_by is null or released_at is not null),
  constraint loan_guarantors_response_consistency
    check (
      (status = 'invited' and responded_at is null)
      or (status in ('accepted', 'declined') and responded_at is not null)
    )
);

create table if not exists public.payment_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid,
  payment_type public.member_payment_type,
  tx_ref text,
  flutterwave_transaction_id text,
  status public.payment_log_status not null default 'received',
  raw_payload jsonb not null,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  title text not null check (char_length(trim(title)) > 0),
  message text not null check (char_length(trim(message)) > 0),
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.loan_audit_logs (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  event_type text not null check (char_length(trim(event_type)) > 0),
  message text not null check (char_length(trim(message)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.loan_products enable row level security;
alter table public.loan_applications enable row level security;
alter table public.loans enable row level security;
alter table public.loan_repayment_schedule enable row level security;
alter table public.loan_transactions enable row level security;
alter table public.loan_guarantors enable row level security;
alter table public.payment_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.loan_audit_logs enable row level security;

create index if not exists idx_loan_products_is_active
  on public.loan_products(is_active);

create index if not exists idx_loan_applications_member_id
  on public.loan_applications(member_id);

create index if not exists idx_loan_applications_loan_product_id
  on public.loan_applications(loan_product_id);

create index if not exists idx_loan_applications_status
  on public.loan_applications(status);

create index if not exists idx_loan_applications_applied_at
  on public.loan_applications(applied_at);

create index if not exists idx_loans_member_id
  on public.loans(member_id);

create index if not exists idx_loans_status
  on public.loans(status);

create index if not exists idx_loan_repayment_schedule_loan_id
  on public.loan_repayment_schedule(loan_id);

create index if not exists idx_loan_repayment_schedule_status
  on public.loan_repayment_schedule(status);

create index if not exists idx_loan_repayment_schedule_due_date
  on public.loan_repayment_schedule(due_date);

create index if not exists idx_loan_transactions_loan_id
  on public.loan_transactions(loan_id);

create index if not exists idx_loan_transactions_type
  on public.loan_transactions(transaction_type);

create index if not exists idx_loan_transactions_date
  on public.loan_transactions(transaction_date);

create index if not exists idx_loan_guarantors_application_id
  on public.loan_guarantors(loan_application_id);

create index if not exists idx_loan_guarantors_guarantor_member_id
  on public.loan_guarantors(guarantor_member_id);

create index if not exists idx_loan_guarantors_status
  on public.loan_guarantors(status);

create index if not exists idx_loan_guarantors_released_at
  on public.loan_guarantors(released_at);

create index if not exists idx_payment_logs_member_id
  on public.payment_logs(member_id);

create index if not exists idx_payment_logs_payment_type
  on public.payment_logs(payment_type);

create index if not exists idx_payment_logs_tx_ref
  on public.payment_logs(tx_ref);

create index if not exists idx_payment_logs_flutterwave_transaction_id
  on public.payment_logs(flutterwave_transaction_id);

create index if not exists idx_payment_logs_status
  on public.payment_logs(status);

create index if not exists idx_notifications_member_id
  on public.notifications(member_id);

create index if not exists idx_notifications_type
  on public.notifications(type);

create index if not exists idx_notifications_is_read
  on public.notifications(is_read);

create index if not exists idx_notifications_created_at
  on public.notifications(created_at desc);

create index if not exists idx_loan_audit_logs_loan_id
  on public.loan_audit_logs(loan_id);

create index if not exists idx_loan_audit_logs_event_type
  on public.loan_audit_logs(event_type);

create index if not exists idx_loan_audit_logs_created_at
  on public.loan_audit_logs(created_at);

drop policy if exists "Authenticated users can read active loan products" on public.loan_products;
create policy "Authenticated users can read active loan products"
on public.loan_products
for select
to authenticated
using (is_active);

drop policy if exists "Admins can read all loan products" on public.loan_products;
create policy "Admins can read all loan products"
on public.loan_products
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Members can read their own loan applications" on public.loan_applications;
create policy "Members can read their own loan applications"
on public.loan_applications
for select
to authenticated
using (auth.uid() = member_id);

drop policy if exists "Admins can read all loan applications" on public.loan_applications;
create policy "Admins can read all loan applications"
on public.loan_applications
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Members can read their own loans" on public.loans;
create policy "Members can read their own loans"
on public.loans
for select
to authenticated
using (auth.uid() = member_id);

drop policy if exists "Admins can read all loans" on public.loans;
create policy "Admins can read all loans"
on public.loans
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Members can read their own loan repayment schedules" on public.loan_repayment_schedule;
create policy "Members can read their own loan repayment schedules"
on public.loan_repayment_schedule
for select
to authenticated
using (
  exists (
    select 1
    from public.loans
    where loans.id = loan_repayment_schedule.loan_id
      and loans.member_id = auth.uid()
  )
);

drop policy if exists "Admins can read all loan repayment schedules" on public.loan_repayment_schedule;
create policy "Admins can read all loan repayment schedules"
on public.loan_repayment_schedule
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Members can read their own loan transactions" on public.loan_transactions;
create policy "Members can read their own loan transactions"
on public.loan_transactions
for select
to authenticated
using (
  exists (
    select 1
    from public.loans
    where loans.id = loan_transactions.loan_id
      and loans.member_id = auth.uid()
  )
);

drop policy if exists "Admins can read all loan transactions" on public.loan_transactions;
create policy "Admins can read all loan transactions"
on public.loan_transactions
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Members can read guarantor requests sent to them" on public.loan_guarantors;
create policy "Members can read guarantor requests sent to them"
on public.loan_guarantors
for select
to authenticated
using (auth.uid() = guarantor_member_id);

drop policy if exists "Members can read guarantors on their own applications" on public.loan_guarantors;
create policy "Members can read guarantors on their own applications"
on public.loan_guarantors
for select
to authenticated
using (
  exists (
    select 1
    from public.loan_applications
    where loan_applications.id = loan_guarantors.loan_application_id
      and loan_applications.member_id = auth.uid()
  )
);

drop policy if exists "Admins can read all loan guarantors" on public.loan_guarantors;
create policy "Admins can read all loan guarantors"
on public.loan_guarantors
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Members can respond to their guarantor requests" on public.loan_guarantors;
create policy "Members can respond to their guarantor requests"
on public.loan_guarantors
for update
to authenticated
using (
  auth.uid() = guarantor_member_id
  and status = 'invited'
)
with check (auth.uid() = guarantor_member_id);

drop policy if exists "Admins can read all payment logs" on public.payment_logs;
create policy "Admins can read all payment logs"
on public.payment_logs
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Members can read their own notifications" on public.notifications;
create policy "Members can read their own notifications"
on public.notifications
for select
to authenticated
using (auth.uid() = member_id);

drop policy if exists "Members can update their own notifications" on public.notifications;
create policy "Members can update their own notifications"
on public.notifications
for update
to authenticated
using (auth.uid() = member_id)
with check (auth.uid() = member_id);

drop policy if exists "Admins can read all notifications" on public.notifications;
create policy "Admins can read all notifications"
on public.notifications
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Members can read audit logs on their own loans" on public.loan_audit_logs;
create policy "Members can read audit logs on their own loans"
on public.loan_audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.loans
    where loans.id = loan_audit_logs.loan_id
      and loans.member_id = auth.uid()
  )
);

drop policy if exists "Admins can read all loan audit logs" on public.loan_audit_logs;
create policy "Admins can read all loan audit logs"
on public.loan_audit_logs
for select
to authenticated
using (public.current_user_is_admin());

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception
  when undefined_object then
    null;
end;
$$;

create or replace function public.validate_loan_guarantor_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  applicant_member_id uuid;
  guarantor_count integer;
begin
  select member_id
  into applicant_member_id
  from public.loan_applications
  where id = new.loan_application_id;

  if applicant_member_id is null then
    raise exception 'Loan application % could not be found for guarantor validation.',
      new.loan_application_id
      using errcode = 'P0002';
  end if;

  if applicant_member_id = new.guarantor_member_id then
    raise exception 'A member cannot act as guarantor on their own loan application.'
      using errcode = '23514';
  end if;

  select count(*)
  into guarantor_count
  from public.loan_guarantors
  where loan_application_id = new.loan_application_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if guarantor_count >= 2 then
    raise exception 'A loan application can only have up to 2 guarantors.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_loan_guarantor_record
  on public.loan_guarantors;

create trigger trg_validate_loan_guarantor_record
before insert or update
on public.loan_guarantors
for each row
execute function public.validate_loan_guarantor_record();

create or replace function public.post_loan_disbursement_journal_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cash_account_id uuid;
  loan_receivable_account_id uuid;
  journal_entry_id uuid;
  entry_description text;
begin
  if new.transaction_type <> 'disbursement' then
    return new;
  end if;

  select id
  into cash_account_id
  from public.accounts
  where account_code = '1000'
    and is_active = true
  limit 1;

  select id
  into loan_receivable_account_id
  from public.accounts
  where account_code = '1100'
    and is_active = true
  limit 1;

  if cash_account_id is null then
    raise exception 'Cash account (1000) is not configured.'
      using errcode = 'P0002';
  end if;

  if loan_receivable_account_id is null then
    raise exception 'Loan Receivable account (1100) is not configured.'
      using errcode = 'P0002';
  end if;

  entry_description := format(
    'Loan disbursement for loan %s',
    new.loan_id
  );

  insert into public.journal_entries (
    entry_date,
    reference_number,
    description,
    created_by,
    total_amount,
    status
  )
  values (
    new.transaction_date::date,
    'LOAN-DISB-' || replace(new.id::text, '-', ''),
    entry_description,
    new.created_by,
    new.amount,
    'draft'
  )
  returning id into journal_entry_id;

  insert into public.journal_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    narration
  )
  values
    (
      journal_entry_id,
      loan_receivable_account_id,
      new.amount,
      0,
      coalesce(new.payment_reference, entry_description)
    ),
    (
      journal_entry_id,
      cash_account_id,
      0,
      new.amount,
      coalesce(new.payment_reference, entry_description)
    );

  update public.journal_entries
  set status = 'posted'
  where id = journal_entry_id;

  return new;
end;
$$;

drop trigger if exists trg_post_loan_disbursement_journal_entry
  on public.loan_transactions;

create trigger trg_post_loan_disbursement_journal_entry
after insert
on public.loan_transactions
for each row
execute function public.post_loan_disbursement_journal_entry();

create or replace function public.process_loan_repayment_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cash_account_id uuid;
  loan_receivable_account_id uuid;
  interest_income_account_id uuid;
  journal_entry_id uuid;
  entry_description text;
  loan_record record;
  schedule_row record;
  amount_remaining numeric(14,2);
  total_principal_applied numeric(14,2) := 0;
  total_interest_applied numeric(14,2) := 0;
  schedule_remaining numeric(14,2);
  remaining_interest numeric(14,2);
  remaining_principal numeric(14,2);
  interest_applied numeric(14,2);
  principal_applied numeric(14,2);
  updated_amount_paid numeric(14,2);
  updated_schedule_status public.loan_repayment_schedule_status;
  updated_outstanding_balance numeric(14,2);
  has_open_schedule boolean := false;
begin
  if new.transaction_type <> 'repayment' then
    return new;
  end if;

  select
    id,
    application_id,
    amount_disbursed,
    outstanding_balance,
    status
  into loan_record
  from public.loans
  where id = new.loan_id
  for update;

  if not found then
    raise exception 'Loan % could not be found for repayment processing.', new.loan_id
      using errcode = 'P0002';
  end if;

  if coalesce(loan_record.amount_disbursed, 0) <= 0 then
    raise exception 'Loan % has not been disbursed yet, so repayments cannot be accepted.', new.loan_id
      using errcode = '23514';
  end if;

  if coalesce(loan_record.outstanding_balance, 0) <= 0
     or loan_record.status = 'completed' then
    raise exception 'Loan % is already fully repaid.', new.loan_id
      using errcode = '23514';
  end if;

  if new.amount > loan_record.outstanding_balance then
    raise exception
      'Repayment amount cannot exceed the outstanding balance. Outstanding: %, attempted: %',
      loan_record.outstanding_balance,
      new.amount
      using errcode = '23514';
  end if;

  update public.loan_repayment_schedule
  set status = 'overdue'
  where loan_id = new.loan_id
    and status = 'pending'
    and due_date < new.transaction_date::date;

  amount_remaining := round(new.amount, 2);

  for schedule_row in
    select
      id,
      due_date,
      principal_due,
      interest_due,
      total_due,
      amount_paid,
      status,
      paid_at
    from public.loan_repayment_schedule
    where loan_id = new.loan_id
      and amount_paid < total_due
    order by due_date, id
    for update
  loop
    has_open_schedule := true;

    exit when amount_remaining <= 0;

    schedule_remaining := round(schedule_row.total_due - schedule_row.amount_paid, 2);
    remaining_interest := greatest(
      round(schedule_row.interest_due - least(schedule_row.amount_paid, schedule_row.interest_due), 2),
      0
    );
    remaining_principal := greatest(
      round(
        schedule_row.principal_due - greatest(schedule_row.amount_paid - schedule_row.interest_due, 0),
        2
      ),
      0
    );

    if schedule_remaining <= 0 then
      continue;
    end if;

    interest_applied := least(amount_remaining, remaining_interest);
    principal_applied := least(
      round(amount_remaining - interest_applied, 2),
      remaining_principal
    );
    updated_amount_paid := round(
      schedule_row.amount_paid + interest_applied + principal_applied,
      2
    );

    if updated_amount_paid >= schedule_row.total_due then
      updated_schedule_status := 'paid';
    else
      updated_schedule_status := 'partial';
    end if;

    update public.loan_repayment_schedule
    set
      amount_paid = updated_amount_paid,
      paid_at = case
        when updated_schedule_status = 'paid'
          then coalesce(schedule_row.paid_at, new.transaction_date)
        else schedule_row.paid_at
      end,
      status = updated_schedule_status
    where id = schedule_row.id;

    total_interest_applied := round(total_interest_applied + interest_applied, 2);
    total_principal_applied := round(total_principal_applied + principal_applied, 2);
    amount_remaining := round(
      amount_remaining - interest_applied - principal_applied,
      2
    );
  end loop;

  if not has_open_schedule then
    raise exception 'No open repayment schedule exists for loan %.', new.loan_id
      using errcode = '23514';
  end if;

  if amount_remaining > 0 then
    raise exception
      'Repayment amount exceeds the remaining scheduled balance by %.',
      amount_remaining
      using errcode = '23514';
  end if;

  if round(total_principal_applied + total_interest_applied, 2) <> new.amount then
    total_principal_applied := round(new.amount - total_interest_applied, 2);
  end if;

  updated_outstanding_balance := round(
    greatest(loan_record.outstanding_balance - new.amount, 0),
    2
  );

  update public.loans
  set
    outstanding_balance = updated_outstanding_balance,
    status = case
      when updated_outstanding_balance = 0 then 'completed'
      when loan_record.status = 'defaulted' then 'defaulted'
      else 'active'
    end
  where id = new.loan_id;

  select id
  into cash_account_id
  from public.accounts
  where account_code = '1000'
    and is_active = true
  limit 1;

  select id
  into loan_receivable_account_id
  from public.accounts
  where account_code = '1100'
    and is_active = true
  limit 1;

  select id
  into interest_income_account_id
  from public.accounts
  where account_code = '4100'
    and is_active = true
  limit 1;

  if cash_account_id is null then
    raise exception 'Cash account (1000) is not configured.'
      using errcode = 'P0002';
  end if;

  if loan_receivable_account_id is null then
    raise exception 'Loan Receivable account (1100) is not configured.'
      using errcode = 'P0002';
  end if;

  if interest_income_account_id is null then
    raise exception 'Interest Income account (4100) is not configured.'
      using errcode = 'P0002';
  end if;

  entry_description := format(
    'Loan repayment for loan %s',
    new.loan_id
  );

  insert into public.journal_entries (
    entry_date,
    reference_number,
    description,
    created_by,
    total_amount,
    status
  )
  values (
    new.transaction_date::date,
    'LOAN-REPAY-' || replace(new.id::text, '-', ''),
    entry_description,
    new.created_by,
    new.amount,
    'draft'
  )
  returning id into journal_entry_id;

  insert into public.journal_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    narration
  )
  values (
    journal_entry_id,
    cash_account_id,
    new.amount,
    0,
    coalesce(new.payment_reference, entry_description)
  );

  if total_principal_applied > 0 then
    insert into public.journal_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      narration
    )
    values (
      journal_entry_id,
      loan_receivable_account_id,
      0,
      total_principal_applied,
      coalesce(new.payment_reference, entry_description)
    );
  end if;

  if total_interest_applied > 0 then
    insert into public.journal_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      narration
    )
    values (
      journal_entry_id,
      interest_income_account_id,
      0,
      total_interest_applied,
      coalesce(new.payment_reference, entry_description)
    );
  end if;

  update public.journal_entries
  set status = 'posted'
  where id = journal_entry_id;

  return new;
end;
$$;

drop trigger if exists trg_process_loan_repayment_transaction
  on public.loan_transactions;

create trigger trg_process_loan_repayment_transaction
after insert
on public.loan_transactions
for each row
execute function public.process_loan_repayment_transaction();

create or replace function public.run_monthly_savings_interest_accrual(
  p_reference_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reference_month text := to_char(date_trunc('month', p_reference_date), 'YYYYMM');
  inserted_count integer := 0;
  total_interest numeric(14,2) := 0;
begin
  with inserted_interest as (
    insert into public.savings_transactions (
      savings_account_id,
      transaction_type,
      amount,
      payment_reference,
      narration,
      transaction_date,
      created_by
    )
    select
      savings_account.id,
      'interest',
      round(savings_account.balance * (savings_account.interest_rate / 100) / 12, 2),
      'SAV-INT-' || reference_month || '-' || replace(savings_account.id::text, '-', ''),
      format(
        'Monthly interest accrual for %s',
        to_char(date_trunc('month', p_reference_date), 'FMMonth YYYY')
      ),
      timezone('utc'::text, now()),
      savings_account.member_id
    from public.savings_accounts as savings_account
    where savings_account.status = 'active'
      and savings_account.interest_rate > 0
      and savings_account.balance > 0
      and round(savings_account.balance * (savings_account.interest_rate / 100) / 12, 2) > 0
      and not exists (
        select 1
        from public.savings_transactions
        where savings_transactions.savings_account_id = savings_account.id
          and savings_transactions.transaction_type = 'interest'
          and savings_transactions.payment_reference = 'SAV-INT-' || reference_month || '-' || replace(savings_account.id::text, '-', '')
      )
    returning amount
  )
  select
    coalesce(count(*), 0),
    coalesce(sum(amount), 0)
  into inserted_count, total_interest
  from inserted_interest;

  return jsonb_build_object(
    'processedAccounts',
    inserted_count,
    'referenceMonth',
    reference_month,
    'totalInterestAccrued',
    total_interest
  );
end;
$$;

create or replace function public.detect_and_flag_overdue_loans()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  marked_schedule_count integer := 0;
  defaulted_loan_count integer := 0;
begin
  with marked_overdue as (
    update public.loan_repayment_schedule
    set status = 'overdue'
    where due_date < current_date
      and status = 'pending'
    returning id
  )
  select count(*)
  into marked_schedule_count
  from marked_overdue;

  with loan_schedule_sequences as (
    select
      loan_id,
      due_date,
      status,
      row_number() over (partition by loan_id order by due_date) -
      row_number() over (partition by loan_id, status order by due_date) as status_group
    from public.loan_repayment_schedule
  ),
  overdue_streaks as (
    select
      loan_id,
      min(due_date) as streak_start,
      max(due_date) as streak_end,
      count(*) as overdue_installments
    from loan_schedule_sequences
    where status = 'overdue'
    group by loan_id, status_group
    having count(*) >= 3
  ),
  newly_defaulted as (
    update public.loans as loan
    set status = 'defaulted'
    from overdue_streaks as streak
    where loan.id = streak.loan_id
      and loan.status not in ('defaulted', 'completed')
      and coalesce(loan.outstanding_balance, 0) > 0
    returning
      loan.id,
      streak.streak_start,
      streak.streak_end,
      streak.overdue_installments
  ),
  inserted_audit_rows as (
    insert into public.loan_audit_logs (
      loan_id,
      event_type,
      message,
      metadata
    )
    select
      newly_defaulted.id,
      'loan_defaulted',
      format(
        'Loan %s was flagged as defaulted after %s consecutive overdue installments.',
        newly_defaulted.id,
        newly_defaulted.overdue_installments
      ),
      jsonb_build_object(
        'overdue_installments',
        newly_defaulted.overdue_installments,
        'streak_start',
        newly_defaulted.streak_start,
        'streak_end',
        newly_defaulted.streak_end
      )
    from newly_defaulted
    returning id
  )
  select count(*)
  into defaulted_loan_count
  from inserted_audit_rows;

  return jsonb_build_object(
    'loansDefaulted',
    defaulted_loan_count,
    'overdueSchedulesMarked',
    marked_schedule_count
  );
end;
$$;

create or replace function public.invoke_contribution_due_reminders()
returns bigint
language plpgsql
security definer
set search_path = public, private
as $$
declare
  project_url text;
  publishable_key text;
  request_id bigint;
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    execute
      'select decrypted_secret
       from vault.decrypted_secrets
       where name = ''project_url''
       limit 1'
    into project_url;

    execute
      'select decrypted_secret
       from vault.decrypted_secrets
       where name = ''publishable_key''
       limit 1'
    into publishable_key;
  end if;

  if project_url is null then
    select config_value
    into project_url
    from private.app_runtime_config
    where config_key = 'project_url'
    limit 1;
  end if;

  if publishable_key is null then
    select config_value
    into publishable_key
    from private.app_runtime_config
    where config_key = 'publishable_key'
    limit 1;
  end if;

  if project_url is null or publishable_key is null then
    raise exception 'Reminder job config is missing. Add project_url and publishable_key to Vault if available, or to private.app_runtime_config.'
      using errcode = 'P0002';
  end if;

  select net.http_post(
    url := project_url || '/functions/v1/send-contribution-due-reminders',
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'apikey',
      publishable_key,
      'Authorization',
      'Bearer ' || publishable_key
    ),
    body := jsonb_build_object(
      'triggeredAt',
      timezone('utc'::text, now())
    )
  )
  into request_id;

  return request_id;
end;
$$;

create or replace function public.schedule_or_replace_cron_job(
  p_job_name text,
  p_schedule text,
  p_command text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  scheduled_job_id bigint;
begin
  if exists (
    select 1
    from cron.job
    where jobname = p_job_name
  ) then
    perform cron.unschedule(p_job_name);
  end if;

  select cron.schedule(
    p_job_name,
    p_schedule,
    p_command
  )
  into scheduled_job_id;

  return scheduled_job_id;
end;
$$;

create or replace function public.release_loan_guarantors_for_completed_loan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    new.amount_disbursed > 0
    and (
      new.status = 'completed'
      or (new.outstanding_balance = 0 and old.outstanding_balance <> 0)
    )
  ) then
    return new;
  end if;

  update public.loan_guarantors
  set released_at = timezone('utc'::text, now())
  where loan_application_id = new.application_id
    and status = 'accepted'
    and released_at is null;

  return new;
end;
$$;

drop trigger if exists trg_release_loan_guarantors_for_completed_loan
  on public.loans;

create trigger trg_release_loan_guarantors_for_completed_loan
after update
on public.loans
for each row
execute function public.release_loan_guarantors_for_completed_loan();

-- pg_cron schedules are written for Supabase's default GMT/UTC cron timezone.
-- Daily 8:00 AM Africa/Lagos is 7:00 AM UTC.
-- Before the reminder job can run successfully, store your project URL and
-- publishable key. If Vault is available:
-- select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
-- select vault.create_secret('<your-publishable-key>', 'publishable_key');
-- If Vault is not available, use the built-in fallback table instead:
-- insert into private.app_runtime_config (config_key, config_value, description)
-- values
--   ('project_url', 'https://<project-ref>.supabase.co', 'Supabase project URL used by cron-triggered edge functions'),
--   ('publishable_key', '<your-publishable-key>', 'Publishable key used to authorize cron-triggered edge functions')
-- on conflict (config_key) do update
-- set
--   config_value = excluded.config_value,
--   description = excluded.description,
--   updated_at = timezone('utc'::text, now());

select public.schedule_or_replace_cron_job(
  'monthly-savings-interest-accrual',
  '0 0 1 * *',
  $$select public.run_monthly_savings_interest_accrual();$$
);

select public.schedule_or_replace_cron_job(
  'daily-overdue-loan-detection',
  '0 7 * * *',
  $$select public.detect_and_flag_overdue_loans();$$
);

select public.schedule_or_replace_cron_job(
  'monthly-contribution-due-reminders',
  '0 7 25 * *',
  $$select public.invoke_contribution_due_reminders();$$
);

-- Production hardening: finance roles, payment rate limiting, audit logs,
-- stricter ledger deletion controls, and policy assertions.

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

drop policy if exists "Finance managers can read all member records" on public.members;
create policy "Finance managers can read all member records"
on public.members
for select
to authenticated
using (public.current_user_can_manage_financial_records());

drop policy if exists "Users can read journal entries they created" on public.journal_entries;
create policy "Users can read journal entries they created"
on public.journal_entries
for select
to authenticated
using (auth.uid() = created_by);

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

do $$
declare
  managed_table text;
begin
  foreach managed_table in array array[
    'accounts',
    'journal_entries',
    'journal_lines',
    'savings_accounts',
    'savings_transactions',
    'member_shares',
    'share_transactions',
    'loans',
    'loan_transactions'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      'Finance managers can read ' || managed_table,
      managed_table
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.current_user_can_manage_financial_records())',
      'Finance managers can read ' || managed_table,
      managed_table
    );
    execute format(
      'drop policy if exists %I on public.%I',
      'Finance managers can insert ' || managed_table,
      managed_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.current_user_can_manage_financial_records())',
      'Finance managers can insert ' || managed_table,
      managed_table
    );
    execute format(
      'drop policy if exists %I on public.%I',
      'Finance managers can update ' || managed_table,
      managed_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.current_user_can_manage_financial_records()) with check (public.current_user_can_manage_financial_records())',
      'Finance managers can update ' || managed_table,
      managed_table
    );
  end loop;
end;
$$;

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
      ('savings_accounts', 'Finance managers can insert savings_accounts'),
      ('savings_accounts', 'Finance managers can update savings_accounts'),
      ('savings_transactions', 'Finance managers can insert savings_transactions'),
      ('savings_transactions', 'Finance managers can update savings_transactions'),
      ('loans', 'Finance managers can insert loans'),
      ('loans', 'Finance managers can update loans'),
      ('loan_transactions', 'Finance managers can insert loan_transactions'),
      ('loan_transactions', 'Finance managers can update loan_transactions'),
      ('member_shares', 'Finance managers can insert member_shares'),
      ('member_shares', 'Finance managers can update member_shares'),
      ('share_transactions', 'Finance managers can insert share_transactions'),
      ('share_transactions', 'Finance managers can update share_transactions'),
      ('journal_entries', 'Finance managers can insert journal_entries'),
      ('journal_entries', 'Finance managers can update journal_entries')
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
