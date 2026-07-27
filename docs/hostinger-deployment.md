# Hostinger static deployment

The production website is a Next.js static export. Hostinger serves the files
from `out/`; authentication, protected writes, scheduled dues, payments, and
webhooks run in Supabase. There is no `next start`, PM2, Passenger, reverse
proxy, `.htaccess` Node rewrite, or persistent Hostinger Node process.

This architecture avoids the 403 caused by Hostinger's Node proxy not binding
to the domain and keeps Hostinger process usage at the minimum possible level.

## 1. Prepare Supabase

For a new Supabase project:

1. Open **Supabase -> SQL Editor**.
2. Run `supabase/sql/full_schema_setup.sql` once.
3. Configure email OTP using `docs/supabase-email-otp-setup.md`.
4. Register the first user, then run
   `supabase/sql/promote_user_to_admin.sql` for that user.

For an existing project, back it up and run these idempotent patches:

1. `supabase/sql/production_hardening_post_schema_patch.sql`
2. `supabase/sql/cooperative_financial_features_patch.sql`

The financial patch installs the fixed ₦10,000 monthly dues job plus the
investment, occasion levy, and meeting-penalty tables and policies.

## 2. Deploy Supabase functions

Install the Supabase CLI locally, sign in, and link the project. Replace the
example project reference with the reference from **Supabase -> Project
Settings -> General**.

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy cooperative-api --no-verify-jwt
supabase functions deploy flutterwave-webhook --no-verify-jwt
supabase functions deploy calculate-dividends
supabase functions deploy generate-repayment-schedule
supabase functions deploy invite-guarantor
supabase functions deploy send-notification
supabase functions deploy send-contribution-due-reminders
```

`cooperative-api` uses `--no-verify-jwt` because registration availability is
public. The function validates the Supabase bearer token itself on every
protected route and checks the user's role before privileged writes.

Add secrets in **Supabase -> Edge Functions -> Secrets** or with the CLI:

```bash
supabase secrets set APP_URL=https://impcs.consolish.com
supabase secrets set FLUTTERWAVE_SECRET_KEY=YOUR_SECRET_KEY
supabase secrets set FLUTTERWAVE_SECRET_HASH=YOUR_SECRET_HASH
```

Add the Africa's Talking and Resend values from `.env.example` only if those
delivery channels are enabled. `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are provided to deployed Supabase functions. Never
copy the service-role key into Hostinger or browser code.

## 3. Configure Supabase Auth

In **Supabase -> Authentication -> URL Configuration**:

- Site URL: `https://impcs.consolish.com`
- Redirect URL: `https://impcs.consolish.com/**`

Use the permanent custom domain here. Do not add Hostinger's temporary preview
or deployment URL; those URLs can change after every deployment.

## 4. Configure Flutterwave

Set the webhook URL in Flutterwave to:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/flutterwave-webhook
```

Set Flutterwave's secret hash to the same value stored as
`FLUTTERWAVE_SECRET_HASH` in Supabase. The webhook is not hosted on the
Hostinger domain anymore.

## 5. Create the Hostinger static deployment

Remove or disconnect the old Node.js application entry for this domain. Then
create a static Git deployment for `impcs.consolish.com` with these values:

| Setting | Value |
| --- | --- |
| Framework | Next.js / Static |
| Node.js version used to build | 22.x |
| Install command | `npm install` |
| Build command | `npm run build` |
| Output directory | `out` or `out/` |
| Start command | none |
| Application root | repository root |

Add only these build variables in Hostinger:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Do not add `SUPABASE_SERVICE_ROLE_KEY`, Flutterwave secrets, Resend secrets, or
SMS keys to Hostinger.

If hPanel cannot publish the Git build output directly, run `npm run build`
locally and upload the **contents inside `out/`** to `public_html/`. The final
layout must look like this:

```text
public_html/
  index.html
  login/index.html
  portal/index.html
  admin/index.html
  _next/
```

It must not look like `public_html/out/index.html`. Remove old manual
`.htaccess` rules that rewrite traffic to `/nodejs/`; static folders and their
`index.html` files do not need that proxy.

## 6. Verify

After deployment, test these URLs in a private browser window:

1. `https://impcs.consolish.com/`
2. `https://impcs.consolish.com/login/`
3. `https://impcs.consolish.com/register/`
4. `https://YOUR_PROJECT_REF.supabase.co/functions/v1/cooperative-api/health`

Then verify:

1. Registration and OTP login complete successfully.
2. Admin and member accounts open their correct dashboards.
3. `/admin/operations/` can generate ₦10,000 dues, create an investment plan,
   record a member investment, and add an occasion levy.
4. Member dashboards show dues, investments, levies, and attendance penalties.
5. KYC uploads, savings, shares, loans, meetings, and report downloads work.
6. A Flutterwave test payment is processed once by the Supabase webhook.

## Troubleshooting

- **403 at the domain root:** the domain is still bound to the old Node app, or
  `index.html` is not directly inside the configured output directory.
- **Hostinger preview URL keeps changing:** normal for deployments; use only
  `https://impcs.consolish.com` in Supabase and provider settings.
- **Blank page or Supabase errors:** confirm both `NEXT_PUBLIC_*` variables were
  present during the build, then rebuild.
- **Actions return 404:** deploy `cooperative-api` and confirm the Supabase
  project URL in Hostinger matches that function's project.
- **Payment starts but does not post:** check the `flutterwave-webhook` logs and
  confirm both Flutterwave secrets and the webhook URL.
- **High process count:** confirm there is no Hostinger start command and no
  Node.js application attached to the domain. Static hosting needs no app
  process.

## Rollback

Redeploy the last known-good Git commit or re-upload its `out/` contents.
Hostinger rollback does not reverse Supabase schema changes, so back up the
database before applying schema files.
