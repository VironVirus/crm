# Supabase Email OTP Setup

Use these steps to make member registration and login send a 6-digit email code from Supabase Auth instead of a magic link.

## 1. Enable email auth in Supabase

1. Open your Supabase project.
2. Go to `Authentication` -> `Providers`.
3. Make sure `Email` is enabled.

## 2. Switch Supabase email auth to OTP mode

Supabase sends a magic link or an OTP depending on the email template contents.

1. Go to `Authentication` -> `Templates`.
2. Open the template Supabase uses for email sign-in and signup in your dashboard version.
3. Make sure the template includes `{{ .Token }}`.
4. Remove any template content that depends only on `{{ .ConfirmationURL }}` if you want code-only verification.

Example message body:

```html
<p>Your Ifemelunma Cooperative verification code is:</p>
<h2>{{ .Token }}</h2>
<p>This code will help you finish signing in securely.</p>
```

## 3. Set the correct site URL

1. Go to `Authentication` -> `URL Configuration`.
2. Set `Site URL` to your live frontend URL.
3. Add your local address too if needed, for example:
   - `http://127.0.0.1:3000`
   - `http://localhost:3000`

## 4. Optional but recommended for production

Supabase default mail is fine for testing, but for production you should add your own SMTP provider in Supabase Auth so delivery is more reliable.

## 5. Reminder and notification emails

Login and registration OTP emails come from Supabase Auth.

Other member emails in this app such as:

- meeting updates
- payment confirmations
- loan approvals and rejections
- guarantor invitations
- due reminders
- dividend notices

are sent through the app notification pipeline, so keep these environment variables set:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
