import "server-only";

function readServerEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readOptionalServerEnv(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

export function getSupabaseServiceRoleKey() {
  return readServerEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
}

export function getAppUrl() {
  return (
    readOptionalServerEnv(process.env.APP_URL) ??
    readOptionalServerEnv(process.env.URL) ??
    readOptionalServerEnv(process.env.DEPLOY_PRIME_URL)
  );
}

export function getFlutterwavePublicKey() {
  return readOptionalServerEnv(process.env.FLUTTERWAVE_PUBLIC_KEY);
}

export function getFlutterwaveSecretKey() {
  return readOptionalServerEnv(process.env.FLUTTERWAVE_SECRET_KEY);
}

export function getFlutterwaveSecretHash() {
  return readOptionalServerEnv(process.env.FLUTTERWAVE_SECRET_HASH);
}

export function getFlutterwaveBaseUrl() {
  const baseUrl =
    readOptionalServerEnv(process.env.FLUTTERWAVE_BASE_URL) ??
    "https://api.flutterwave.com";

  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export function getAfricasTalkingUsername() {
  return readOptionalServerEnv(process.env.AFRICASTALKING_USERNAME);
}

export function getAfricasTalkingApiKey() {
  return readOptionalServerEnv(process.env.AFRICASTALKING_API_KEY);
}

export function getAfricasTalkingSenderId() {
  return readOptionalServerEnv(process.env.AFRICASTALKING_SENDER_ID);
}

export function getAfricasTalkingBaseUrl() {
  return (
    readOptionalServerEnv(process.env.AFRICASTALKING_BASE_URL) ??
    "https://api.africastalking.com"
  );
}

export function getResendApiKey() {
  return readOptionalServerEnv(process.env.RESEND_API_KEY);
}

export function getResendFromEmail() {
  return readOptionalServerEnv(process.env.RESEND_FROM_EMAIL);
}
