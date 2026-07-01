# Ifemelumma Cooperative Society

Next.js 14, Supabase, Tailwind CSS, and shadcn/ui cooperative society management system.

## Development

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Production Environment

`next start` validates the required production environment variables before the app starts. Keep `.env.example` in sync with deployment secrets.

Required Next.js app variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Recommended feature variables:

- `APP_URL`
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

For an existing database that already ran the full schema, run `supabase/sql/production_hardening_post_schema_patch.sql` to add production RLS hardening, audit logs, journal delete protection, and payment initiation rate limiting.

## Netlify Deployment Checklist

1. Push this repo to GitHub.
2. Create a new Netlify site from the GitHub repo.
3. Leave the build command as `pnpm build`.
4. Add the required Supabase app variables in Netlify environment settings.
5. Add the recommended Flutterwave, Africa's Talking, and Resend variables before enabling those live features.
6. Deploy the site.
