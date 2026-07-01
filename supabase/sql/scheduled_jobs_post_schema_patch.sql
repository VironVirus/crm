-- Ifemelumma Cooperative Society
-- Post-schema patch for scheduled jobs, dividend refresh, and reminder config fallback.
-- Use this if the main full schema had already been run previously and a later rerun
-- failed on the unavailable Vault extension.

create schema if not exists extensions;
create schema if not exists private;

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

create table if not exists public.loan_audit_logs (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  event_type text not null check (char_length(trim(event_type)) > 0),
  message text not null check (char_length(trim(message)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.loan_audit_logs enable row level security;

create index if not exists idx_loan_audit_logs_loan_id
  on public.loan_audit_logs(loan_id);

create index if not exists idx_loan_audit_logs_event_type
  on public.loan_audit_logs(event_type);

create index if not exists idx_loan_audit_logs_created_at
  on public.loan_audit_logs(created_at);

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

-- Replace the values below with your real project URL and anon or publishable key.
insert into private.app_runtime_config (config_key, config_value, description)
values
  ('project_url', 'https://YOUR_PROJECT_REF.supabase.co', 'Supabase project URL used by cron-triggered edge functions'),
  ('publishable_key', 'YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY', 'Publishable key used to authorize cron-triggered edge functions')
on conflict (config_key) do update
set
  config_value = excluded.config_value,
  description = excluded.description,
  updated_at = timezone('utc'::text, now());

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
