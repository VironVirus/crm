# Ifemelunma Cooperative Society

A full-stack cooperative society management system built with Next.js 14,
Supabase, Tailwind CSS, and shadcn/ui.

## What the app does

The application has two authenticated workspaces:

- **Member portal:** onboarding and KYC, automated monthly dues, investment
  positions, occasion levies and attendance penalties, savings, share
  purchases, loan applications and guarantor responses, repayments, meetings
  and attendance, notifications, financial records, and PDF statements.
- **Administration:** member verification and roles, savings transactions,
  monthly dues, investment plans and member investments, occasion levies,
  configurable attendance penalties, loan products and approval/disbursement
  workflows, share transfers and dividends, meeting/attendance management,
  dashboards, accounting reports, and environment readiness checks.

Supabase provides email OTP authentication, Postgres data storage, private KYC
file storage, Row Level Security, database functions/triggers, and Edge
Functions. Flutterwave handles hosted payments and verified webhooks. Africa's
Talking and Resend provide optional SMS and email delivery.

## Development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`.

Copy `.env.example` to `.env.local` and replace the example values before using
authenticated features locally.

## Production Environment

`next build` and `next start` validate the required production environment
variables. Keep `.env.example` in sync with deployment secrets.

Required Next.js app variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Recommended feature variables:

- `APP_URL`
- `FLUTTERWAVE_MOCK_MODE`
- `FLUTTERWAVE_PUBLIC_KEY`
- `FLUTTERWAVE_SECRET_KEY`
- `FLUTTERWAVE_SECRET_HASH`
- `AFRICASTALKING_USERNAME`
- `AFRICASTALKING_API_KEY`
- `AFRICASTALKING_SENDER_ID`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Optional override variables:

- `FLUTTERWAVE_BASE_URL`
- `AFRICASTALKING_BASE_URL`

Netlify notes:

- `netlify.toml` uses `pnpm build`.
- `.nvmrc` and `package.json` pin the deployment runtime to Node `20.x`.
- If `APP_URL` is not set, the app falls back to Netlify-provided `URL` or `DEPLOY_PRIME_URL`.
- Payments, SMS, and email features remain runtime-dependent on their provider secrets. The base app can still build without them.

Hostinger notes:

- Deploy this as a **Node.js Web App** using the Next.js preset, Node 20, pnpm,
  `pnpm build`, and `pnpm start`.
- Add the required environment variables before the first build.
- See [`docs/hostinger-deployment.md`](docs/hostinger-deployment.md) for the
  complete database, hPanel, provider callback, verification, and rollback
  checklist.
- The liveness endpoint is available at `/api/health`.

Required Supabase Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`
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

## Netlify Deployment Checklist

1. Push this repo to GitHub.
2. Create a new Netlify site from the GitHub repo.
3. Leave the build command as `pnpm build`.
4. Add the required Supabase app variables in Netlify environment settings.
5. Add the recommended Flutterwave, Africa's Talking, and Resend variables before enabling those live features.
6. Deploy the site.
