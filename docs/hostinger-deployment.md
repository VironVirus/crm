# Hostinger deployment

This application must be deployed as a **Node.js / Next.js web app**. Do not
upload it as a static site: the authenticated pages, API routes, payment
webhook, and server-side Supabase access require a running Node.js process.

## Hosting requirements

- Hostinger Business Web Hosting, a supported Cloud plan, or a VPS
- Node.js 20.x
- pnpm
- A Supabase project
- A public HTTPS domain

The managed Node.js Web App flow is the simplest option. A VPS also works, but
requires you to manage the process manager, reverse proxy, SSL, updates, and
backups yourself.

## 1. Prepare Supabase

For a new Supabase project:

1. Open the Supabase SQL Editor.
2. Run `supabase/sql/full_schema_setup.sql` once.
3. Follow `docs/supabase-email-otp-setup.md` to configure email OTP login.
4. Create a normal user through the app, then use
   `supabase/sql/promote_user_to_admin.sql` to promote the intended first admin.
5. Deploy the Edge Functions required by the enabled features:
   - `send-notification`
   - `send-contribution-due-reminders`
   - `calculate-dividends`
   - `invite-guarantor`
   - `generate-repayment-schedule`
   - `generate-member-number` is optional because the app can use the database
     RPC directly.
6. Configure the Edge Function secrets listed in `.env.example` and
   `supabase/README.md`.

For an existing production database, back it up and run these files in the SQL
Editor instead of re-running the full schema:

1. `supabase/sql/production_hardening_post_schema_patch.sql`
2. `supabase/sql/cooperative_financial_features_patch.sql`

Both are idempotent, so a deployment retry does not duplicate monthly dues,
levies, or investment records.

## 2. Create the Hostinger app

In hPanel:

1. Go to **Websites -> Add website -> Node.js Web App**.
2. Choose **Import Git Repository** and connect this repository.
3. Use these settings if Hostinger does not detect them automatically:

   | Setting | Value |
   | --- | --- |
   | Framework | Next.js |
   | Node.js version | 20.x |
   | Package manager | pnpm |
   | Install command | `pnpm install --frozen-lockfile` |
   | Build command | `pnpm build` |
   | Start command | `pnpm start` |
   | Build output | `.next` |

Do not set a custom entry file when the **Next.js** framework preset is active.
The `start` script reads Hostinger's assigned `PORT` automatically.
The repository pins pnpm 10 in `package.json`; do not override it with pnpm 11
in hPanel because Hostinger's Node 20 Corepack launcher cannot execute pnpm 11's
ES module shim.

## 3. Add environment variables

Add these in hPanel before the first build. Values must not be committed to
Git.

Required for the app to start:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Required for correct production links and callbacks:

```text
APP_URL=https://your-domain.example
```

Add the Flutterwave variables before enabling real payments:

```text
FLUTTERWAVE_MOCK_MODE=false
FLUTTERWAVE_PUBLIC_KEY=...
FLUTTERWAVE_SECRET_KEY=...
FLUTTERWAVE_SECRET_HASH=...
FLUTTERWAVE_BASE_URL=https://api.flutterwave.com
```

Use `FLUTTERWAVE_MOCK_MODE=true` only for a non-production test environment.
Africa's Talking and Resend values are also needed if SMS and app-generated
email notifications are enabled; see `.env.example` for the full list.

`NEXT_PUBLIC_*` values are embedded during `pnpm build`. If either public
Supabase value changes, update it in hPanel and redeploy rather than only
restarting the app.

## 4. Configure external service URLs

After the Hostinger domain is live:

1. In Supabase Auth URL Configuration, set the Site URL to `APP_URL` and add
   any required redirect URLs.
2. In Flutterwave, set the webhook URL to:
   `https://your-domain.example/api/payments/webhook`
3. Ensure the Flutterwave secret hash exactly matches
   `FLUTTERWAVE_SECRET_HASH` in Hostinger.
4. Verify the sender domain/address used by `RESEND_FROM_EMAIL` before enabling
   production email delivery.

## 5. Deploy and verify

Deploy from hPanel, then check:

1. `https://your-domain.example/api/health` returns JSON with `"status":"ok"`.
2. Registration sends a Supabase email OTP and completes successfully.
3. Login redirects a member to `/portal` and an admin to `/admin`.
4. KYC uploads work in the private `member-kyc` bucket.
5. A payment can be initiated and its webhook is accepted exactly once.
6. Admin savings, loan, share, meeting, cooperative finance, and report
   operations load without authorization or database errors.
7. `/admin/operations` can sync the current month's ₦10,000 dues, create an
   investment plan, record a member investment, and assign an occasion levy.
8. Member `/portal` and `/portal/financials` pages show their dues,
   investments, levies, and attendance penalties.
9. Hostinger logs contain no missing-environment-variable messages.

## Rollback

Use Hostinger's deployment history to redeploy the last known-good Git commit.
Database migrations and one-off SQL changes are not rolled back with the web
app, so back up the Supabase database before applying production schema changes.

## VPS alternative

On a Hostinger VPS, clone the repository, install Node.js 20 and pnpm, add the
environment variables through a protected service configuration, then run:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Run the start command under a process manager such as PM2 or systemd, and put
NGINX in front of the assigned local port with HTTPS enabled. Keep `.env*`, the
Supabase service role key, and provider secrets out of the web root and source
control.
