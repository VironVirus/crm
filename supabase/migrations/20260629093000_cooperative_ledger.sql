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
