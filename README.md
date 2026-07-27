# Ifemelunma Cooperative Society

A cooperative society management system built with Next.js 15,
Supabase, Tailwind CSS, and shadcn/ui.

## What the app does

The application has two authenticated workspaces:

- **Member portal:** onboarding and KYC, automated monthly dues, investment
  positions, occasion levies and attendance penalties, savings, share
  purchases, loan applications and guarantor responses, repayments, meetings
  and attendance, notifications, financial records, and downloadable statements.
- **Administration:** member verification and roles, savings transactions,
  monthly dues, investment plans and member investments, occasion levies,
  configurable attendance penalties, loan products and approval/disbursement
  workflows, share transfers and dividends, meeting/attendance management,
  dashboards, accounting reports, and environment readiness checks.

The production web bundle is a static export. Hostinger only serves the files
in `out/`; it does not run a Node.js process. Supabase provides email OTP
authentication, Postgres data storage, private KYC storage, Row Level Security,
database jobs, and on-demand Edge Functions. Flutterwave handles hosted
payments and verified webhooks. Africa's Talking and Resend provide optional
SMS and email delivery.

## Development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`.

Copy `.env.example` to `.env.local` and replace the example values before using
authenticated features locally.

## Production Environment

`next build` validates the public production variables and exports the site to
`out/`. Keep `.env.example` in sync with deployment secrets.

Required Next.js app variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Do not put the Supabase service-role key, Flutterwave secrets, email keys, or
SMS keys in Hostinger. Those belong in Supabase Edge Function secrets only.

Hostinger notes:

- Deploy this as a **static website**, not a Node.js Web App.
- Use Node 22 only for the build, run `npm run build`, and publish `out/`.
- Add only the two `NEXT_PUBLIC_SUPABASE_*` variables to Hostinger.
- See [`docs/hostinger-deployment.md`](docs/hostinger-deployment.md) for the
  complete database, hPanel, provider callback, verification, and rollback
  checklist.
- The static site uses no persistent Hostinger application process.

Required Supabase Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`
- `FLUTTERWAVE_SECRET_KEY`
- `FLUTTERWAVE_SECRET_HASH`
- `AFRICASTALKING_USERNAME`
- `AFRICASTALKING_API_KEY`
- `AFRICASTALKING_SENDER_ID`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

## Supabase Schema

For a fresh database, run `supabase/sql/full_schema_setup.sql`.

For an existing database that already ran the full schema, run these patches in
the Supabase SQL Editor:

1. `supabase/sql/production_hardening_post_schema_patch.sql` for production RLS
   hardening, audit logs, journal delete protection, and payment initiation rate
   limiting.
2. `supabase/sql/cooperative_financial_features_patch.sql` for automated
   monthly dues, investments, occasion levies, and configurable attendance
   penalties.
