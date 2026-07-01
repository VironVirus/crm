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
