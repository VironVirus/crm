# Supabase Setup

For your manual Supabase setup, use this single file:

- [sql/full_schema_setup.sql](/Users/mac/Desktop/crm/supabase/sql/full_schema_setup.sql)

This is the main schema file and should stay cumulative.
Any new base tables, enums, functions, triggers, and policies should also be
added there so you do not have many SQL files to run.

Versioned migration files are still kept in the repo for development history,
but you do not need to run them one by one in the SQL editor.

Only run separate SQL files when they are true patches or one-off actions.

Current patch / one-off SQL:

- [sql/promote_user_to_admin.sql](/Users/mac/Desktop/crm/supabase/sql/promote_user_to_admin.sql)
  Run this separately after a user signs up if you want to promote that person to `admin`.

This setup includes:

- Enables `uuid-ossp`, `pgcrypto`, and `pg_cron`
- Turns on Row Level Security for existing public tables
- Automatically enables Row Level Security for future public tables
- Creates the cooperative `roles` enum
- Creates the `profiles` table linked to `auth.users`
- Adds profile read policies for members and admins
- Creates the double-entry accounting ledger tables
- Validates balanced posted journal entries
- Seeds a starter cooperative chart of accounts
- Automatically provisions `public.profiles` rows for new Supabase auth users
- Creates the `public.members` registration table
- Creates a private `member-kyc` storage bucket
- Adds member number generation support through `public.assign_member_number(uuid)`
- Creates savings accounts, savings transactions, and contribution schedules
- Automatically posts savings transactions into the double-entry ledger
- Creates share configuration, member share holdings, share transactions, and dividend tables
- Automatically updates member share balances and posts share purchases into the double-entry ledger
- Creates loan products, loan applications, loans, repayment schedules, and loan transactions
- Creates loan guarantor records with member/admin access rules
- Automatically posts loan disbursements into the double-entry ledger
- Automatically releases accepted guarantors when a loan is fully repaid

Optional edge function:

- `functions/generate-member-number`
  This repo includes an Edge Function version of the member-number generator,
  but the app can now call the database RPC directly, so deployment of this
  function is optional.
- `functions/generate-repayment-schedule`
  This Edge Function takes a `loanId`, calculates the amortization schedule
  from the loan product's interest type, and inserts the repayment rows into
  `loan_repayment_schedule`.
- `functions/invite-guarantor`
  This Edge Function validates guarantor eligibility, inserts the
  `loan_guarantors` row, and sends optional SMS/email notifications through
  Africa's Talking and Resend when the required secrets are configured.
