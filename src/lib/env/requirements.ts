export const REQUIRED_APP_ENVIRONMENT_VARIABLES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export const RECOMMENDED_APP_ENVIRONMENT_VARIABLES = [
  "APP_URL",
  "FLUTTERWAVE_MOCK_MODE",
  "FLUTTERWAVE_PUBLIC_KEY",
  "FLUTTERWAVE_SECRET_KEY",
  "FLUTTERWAVE_SECRET_HASH",
  "AFRICASTALKING_USERNAME",
  "AFRICASTALKING_API_KEY",
  "AFRICASTALKING_SENDER_ID",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
] as const;

export const REQUIRED_SUPABASE_EDGE_FUNCTION_SECRETS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "APP_URL",
  "AFRICASTALKING_USERNAME",
  "AFRICASTALKING_API_KEY",
  "AFRICASTALKING_SENDER_ID",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
] as const;

const ENVIRONMENT_VARIABLE_DESCRIPTIONS: Record<string, string> = {
  AFRICASTALKING_API_KEY: "API key for SMS delivery through Africa's Talking.",
  AFRICASTALKING_SENDER_ID: "Approved sender ID for outbound SMS messages.",
  AFRICASTALKING_USERNAME: "Africa's Talking username for the messaging account.",
  APP_URL: "Public base URL for redirects, webhooks, and generated links.",
  FLUTTERWAVE_MOCK_MODE:
    "Set to true to use the built-in demo Flutterwave checkout instead of the live gateway.",
  FLUTTERWAVE_PUBLIC_KEY: "Flutterwave public key used for payment initialization.",
  FLUTTERWAVE_SECRET_HASH: "Secret hash used to verify Flutterwave webhooks.",
  FLUTTERWAVE_SECRET_KEY: "Flutterwave secret key used for payment verification.",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "Supabase publishable key for client access.",
  NEXT_PUBLIC_SUPABASE_URL: "Supabase project URL used by the web app.",
  RESEND_API_KEY: "API key for transactional email delivery through Resend.",
  RESEND_FROM_EMAIL: "Verified sender email address for outgoing messages.",
  SUPABASE_SERVICE_ROLE_KEY: "Supabase service role key for secure server actions.",
  SUPABASE_URL: "Supabase project URL used by Edge Functions.",
};

function withDescriptions(values: readonly string[]) {
  return values.map((name) => ({
    description:
      ENVIRONMENT_VARIABLE_DESCRIPTIONS[name] ??
      "Configuration value required by the application.",
    name,
  }));
}

export function getRequiredEnvironmentVariables() {
  return {
    recommended: withDescriptions(RECOMMENDED_APP_ENVIRONMENT_VARIABLES),
    required: withDescriptions(REQUIRED_APP_ENVIRONMENT_VARIABLES),
  };
}
