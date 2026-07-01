-- Ifemelunma Cooperative Society
-- One-time cleanup for obvious demo/test placeholder accounts.
-- This keeps system setup rows such as chart of accounts, loan products,
-- share configuration, and cron configuration.

do $$
declare
  demo_user_ids uuid[] := array[]::uuid[];
  demo_member_ids uuid[] := array[]::uuid[];
  demo_savings_account_ids uuid[] := array[]::uuid[];
  demo_loan_application_ids uuid[] := array[]::uuid[];
  demo_loan_ids uuid[] := array[]::uuid[];
  removed_count integer := 0;
begin
  update storage.buckets
  set
    file_size_limit = 1048576,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    ]
  where id = 'member-kyc';

  select coalesce(array_agg(flagged_users.id), array[]::uuid[])
  into demo_user_ids
  from (
    select profiles.id
    from public.profiles
    where lower(profiles.email) in (
        'member@ifemelunma.coop',
        'member@ifemelumma.coop',
        'replace-with-your-email@example.com'
      )
      or lower(profiles.email) like '%@example.com'
      or lower(profiles.email) like '%@example.org'
      or profiles.full_name in (
        'Adaeze Okonkwo',
        'Chinedu Okonkwo',
        'Demo Member',
        'Sample Member',
        'Test Member'
      )
  ) as flagged_users;

  removed_count := coalesce(array_length(demo_user_ids, 1), 0);

  if removed_count = 0 then
    raise notice 'No matching demo accounts were found.';
    return;
  end if;

  select coalesce(array_agg(members.id), array[]::uuid[])
  into demo_member_ids
  from public.members
  where members.id = any(demo_user_ids);

  select coalesce(array_agg(savings_accounts.id), array[]::uuid[])
  into demo_savings_account_ids
  from public.savings_accounts
  where savings_accounts.member_id = any(demo_member_ids);

  select coalesce(array_agg(loan_applications.id), array[]::uuid[])
  into demo_loan_application_ids
  from public.loan_applications
  where loan_applications.member_id = any(demo_member_ids);

  select coalesce(array_agg(loans.id), array[]::uuid[])
  into demo_loan_ids
  from public.loans
  where loans.member_id = any(demo_member_ids)
     or loans.application_id = any(demo_loan_application_ids);

  delete from public.payment_logs
  where member_id = any(demo_member_ids);

  delete from public.notifications
  where member_id = any(demo_user_ids);

  delete from public.payment_initiation_rate_limits
  where member_id = any(demo_member_ids);

  delete from public.loan_audit_logs
  where loan_id = any(demo_loan_ids);

  delete from public.loan_transactions
  where loan_id = any(demo_loan_ids)
     or created_by = any(demo_user_ids);

  delete from public.loan_repayment_schedule
  where loan_id = any(demo_loan_ids);

  delete from public.loan_guarantors
  where loan_application_id = any(demo_loan_application_ids)
     or guarantor_member_id = any(demo_member_ids);

  delete from public.loans
  where id = any(demo_loan_ids);

  delete from public.loan_applications
  where id = any(demo_loan_application_ids);

  delete from public.dividend_payments
  where member_id = any(demo_member_ids);

  delete from public.share_transactions
  where member_id = any(demo_member_ids)
     or created_by = any(demo_user_ids);

  delete from public.member_shares
  where member_id = any(demo_member_ids);

  delete from public.savings_transactions
  where savings_account_id = any(demo_savings_account_ids)
     or created_by = any(demo_user_ids);

  delete from public.savings_accounts
  where id = any(demo_savings_account_ids);

  delete from public.contribution_schedules
  where member_id = any(demo_member_ids);

  delete from public.journal_lines
  where journal_entry_id in (
    select journal_entries.id
    from public.journal_entries
    where journal_entries.created_by = any(demo_user_ids)
  );

  delete from public.journal_entries
  where created_by = any(demo_user_ids);

  delete from public.audit_logs
  where performed_by = any(demo_user_ids);

  delete from auth.users
  where id = any(demo_user_ids);

  raise notice 'Removed % demo account(s).', removed_count;
end
$$;

select count(*) as remaining_demo_accounts
from public.profiles
where lower(email) in (
    'member@ifemelunma.coop',
    'member@ifemelumma.coop',
    'replace-with-your-email@example.com'
  )
  or lower(email) like '%@example.com'
  or lower(email) like '%@example.org'
  or full_name in (
    'Adaeze Okonkwo',
    'Chinedu Okonkwo',
    'Demo Member',
    'Sample Member',
    'Test Member'
  );
