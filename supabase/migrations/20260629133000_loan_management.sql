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

alter table public.loan_products enable row level security;
alter table public.loan_applications enable row level security;
alter table public.loans enable row level security;
alter table public.loan_repayment_schedule enable row level security;
alter table public.loan_transactions enable row level security;

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
