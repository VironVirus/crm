import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type DividendDeclarationRecord = {
  dividend_per_share: number | string | null;
  id: string;
  status: "declared" | "paid";
  total_profit: number | string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function parseMoney(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
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

  let payload: { financialYear?: string };

  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON payload." }, 400);
  }

  const financialYear = payload.financialYear?.trim();

  if (!financialYear) {
    return json({ error: "financialYear is required." }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: declaration, error: declarationError } = await supabase
    .from("dividend_declarations")
    .select("id, total_profit, dividend_per_share, status")
    .eq("financial_year", financialYear)
    .maybeSingle();

  if (declarationError) {
    return json({ error: declarationError.message }, 400);
  }

  if (!declaration) {
    return json(
      {
        error:
          "No dividend declaration was found for that financial year. Declare the year first, then recalculate.",
      },
      404,
    );
  }

  const declarationRecord = declaration as DividendDeclarationRecord;

  if (declarationRecord.status === "paid") {
    return json(
      {
        error: "Paid dividend declarations cannot be recalculated automatically.",
      },
      409,
    );
  }

  const refreshResult = await supabase.rpc(
    "refresh_dividend_payment_rows_for_declaration",
    {
      p_dividend_declaration_id: declarationRecord.id,
    },
  );

  if (refreshResult.error) {
    return json({ error: refreshResult.error.message }, 400);
  }

  const [{ data: refreshedDeclaration, error: refreshedDeclarationError }, { count: paymentCount, error: paymentCountError }] =
    await Promise.all([
      supabase
        .from("dividend_declarations")
        .select("dividend_per_share, total_profit")
        .eq("id", declarationRecord.id)
        .single(),
      supabase
        .from("dividend_payments")
        .select("id", { count: "exact", head: true })
        .eq("dividend_declaration_id", declarationRecord.id),
    ]);

  if (refreshedDeclarationError) {
    return json({ error: refreshedDeclarationError.message }, 400);
  }

  if (paymentCountError) {
    return json({ error: paymentCountError.message }, 400);
  }

  return json({
    declarationId: declarationRecord.id,
    dividendPerShare: parseMoney(
      (refreshedDeclaration as DividendDeclarationRecord | null)
        ?.dividend_per_share,
    ),
    financialYear,
    paymentCount: paymentCount ?? 0,
    totalProfit: parseMoney(
      (refreshedDeclaration as DividendDeclarationRecord | null)?.total_profit,
    ),
  });
});
