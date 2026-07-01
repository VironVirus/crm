import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json(
      { error: "Supabase environment variables are missing." },
      500,
    );
  }

  let payload: { memberId?: string };

  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON payload." }, 400);
  }

  if (!payload.memberId) {
    return json({ error: "memberId is required." }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: memberNumber, error } = await supabase.rpc(
    "assign_member_number",
    {
      target_profile_id: payload.memberId,
    },
  );

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({
    memberId: payload.memberId,
    memberNumber,
  });
});
