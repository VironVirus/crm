import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type PaymentRateLimitResult = {
  allowed?: boolean;
  limit?: number;
  remaining?: number;
  reset_at?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status,
  });
}

export async function enforcePaymentInitiationRateLimit({
  limit = 5,
  memberId,
  serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseUrl = Deno.env.get("SUPABASE_URL"),
  windowSeconds = 60,
}: {
  limit?: number;
  memberId: string;
  serviceRoleKey?: string | null;
  supabaseUrl?: string | null;
  windowSeconds?: number;
}) {
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase environment variables are missing." }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.rpc(
    "check_payment_initiation_rate_limit",
    {
      p_limit: limit,
      p_member_id: memberId,
      p_window_seconds: windowSeconds,
    },
  );

  if (error) {
    return json(
      { error: "Unable to verify the payment rate limit right now." },
      500,
    );
  }

  const result = data as PaymentRateLimitResult | null;

  if (result?.allowed === false) {
    return json(
      {
        error:
          "Too many payment attempts. Please wait a minute before trying again.",
        resetAt: result.reset_at ?? null,
      },
      429,
    );
  }

  return null;
}
