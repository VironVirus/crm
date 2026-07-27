import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FLUTTERWAVE_SECRET_KEY = Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "";
const FLUTTERWAVE_SECRET_HASH = Deno.env.get("FLUTTERWAVE_SECRET_HASH") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

async function validSignature(rawBody: string, headers: Headers) {
  if (!FLUTTERWAVE_SECRET_HASH) return false;
  const legacy = headers.get("verif-hash");
  if (legacy) return constantTimeEqual(legacy.trim(), FLUTTERWAVE_SECRET_HASH.trim());
  const supplied = headers.get("flutterwave-signature");
  if (!supplied) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(FLUTTERWAVE_SECRET_HASH),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(supplied.trim(), expected);
}

async function logPayment(values: Record<string, unknown>) {
  return admin.from("payment_logs").insert(values).select("id").single();
}

async function updateLog(id: string, status: string, errorMessage?: string) {
  await admin.from("payment_logs").update({
    status,
    error_message: errorMessage ?? null,
    processed_at: new Date().toISOString(),
  }).eq("id", id);
}

async function recordSavings(memberId: string, amount: number, reference: string, metadata: Record<string, unknown>) {
  const accountType = text(metadata.account_type);
  if (!["mandatory", "voluntary", "fixed_deposit"].includes(accountType)) throw new Error("Savings payment metadata is missing a valid account type.");
  const { data: duplicate } = await admin.from("savings_transactions").select("id").eq("payment_reference", reference).maybeSingle();
  if (duplicate) return "duplicate";
  const { data: accounts } = await admin.from("savings_accounts").select("id, status").eq("member_id", memberId).eq("account_type", accountType).order("created_at", { ascending: false });
  let accountId = (accounts ?? []).find((row) => row.status === "active")?.id;
  if (!accountId) {
    const created = await admin.from("savings_accounts").insert({ member_id: memberId, account_type: accountType }).select("id").single();
    if (created.error || !created.data) throw new Error(created.error?.message ?? "Unable to create the savings account.");
    accountId = created.data.id;
  }
  const result = await admin.from("savings_transactions").insert({
    amount,
    created_by: memberId,
    narration: text(metadata.narration) || null,
    payment_reference: reference,
    savings_account_id: accountId,
    transaction_type: "deposit",
  });
  if (result.error) throw new Error(result.error.message);
  return "processed";
}

async function recordLoan(memberId: string, amount: number, reference: string, metadata: Record<string, unknown>) {
  const loanId = text(metadata.loan_id);
  const { data: duplicate } = await admin.from("loan_transactions").select("id").eq("payment_reference", reference).eq("transaction_type", "repayment").maybeSingle();
  if (duplicate) return "duplicate";
  const { data: loan } = await admin.from("loans").select("outstanding_balance, status").eq("id", loanId).eq("member_id", memberId).maybeSingle();
  if (!loan || !["active", "defaulted"].includes(loan.status)) throw new Error("The active loan attached to this payment could not be found.");
  if (amount > money(loan.outstanding_balance)) throw new Error("Repayment amount exceeds the outstanding balance.");
  const result = await admin.from("loan_transactions").insert({ amount, created_by: memberId, loan_id: loanId, payment_reference: reference, transaction_type: "repayment" });
  if (result.error) throw new Error(result.error.message);
  return "processed";
}

async function recordShares(memberId: string, amount: number, reference: string, metadata: Record<string, unknown>) {
  const { data: duplicate } = await admin.from("share_transactions").select("id").eq("payment_reference", reference).eq("transaction_type", "purchase").maybeSingle();
  if (duplicate) return "duplicate";
  const { data: config } = await admin.from("share_config").select("share_value, minimum_shares").limit(1).maybeSingle();
  const value = money(config?.share_value);
  const count = Math.round(amount / value);
  if (!config || value <= 0 || Math.abs(amount / value - count) > 0.000001 || count < config.minimum_shares) throw new Error("The verified amount does not match the current share configuration.");
  const result = await admin.from("share_transactions").insert({
    amount,
    created_by: memberId,
    member_id: memberId,
    notes: text(metadata.notes) || null,
    payment_reference: reference,
    shares_count: count,
    transaction_type: "purchase",
  });
  if (result.error) throw new Error(result.error.message);
  return "processed";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ message: "Method not allowed." }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !FLUTTERWAVE_SECRET_KEY || !FLUTTERWAVE_SECRET_HASH) return json({ message: "Webhook environment is incomplete." }, 500);
  const rawBody = await request.text();
  if (!(await validSignature(rawBody, request.headers))) return json({ message: "Invalid webhook signature." }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ message: "Invalid webhook payload." }, 400);
  }
  const eventData = ((payload.data && typeof payload.data === "object") ? payload.data : payload) as Record<string, unknown>;
  const metadata = ((eventData.meta ?? eventData.meta_data ?? eventData.metadata ?? {}) as Record<string, unknown>);
  const paymentType = text(metadata.payment_type);
  const memberId = text(metadata.member_id);
  const txRef = text(eventData.tx_ref || payload.tx_ref);
  const transactionId = String(eventData.id ?? "");
  const log = await logPayment({
    member_id: memberId || null,
    payment_type: ["savings_deposit", "loan_repayment", "share_purchase"].includes(paymentType) ? paymentType : null,
    tx_ref: txRef || null,
    flutterwave_transaction_id: transactionId || null,
    status: "received",
    raw_payload: payload,
  });
  if (log.error || !log.data) return json({ message: "Unable to create a payment log." }, 500);
  if (!memberId || !txRef || !transactionId || !["savings_deposit", "loan_repayment", "share_purchase"].includes(paymentType)) {
    await updateLog(log.data.id, "handler_failed", "Incomplete payment metadata.");
    return json({ message: "Incomplete payment metadata." }, 400);
  }
  const { data: prior } = await admin.from("payment_logs").select("id").eq("tx_ref", txRef).eq("status", "processed").neq("id", log.data.id).limit(1).maybeSingle();
  if (prior) {
    await updateLog(log.data.id, "duplicate");
    return json({ ok: true, status: "duplicate" });
  }

  try {
    const verificationResponse = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`, {
      headers: { authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}` },
    });
    const verification = await verificationResponse.json() as Record<string, unknown>;
    const verified = (verification.data ?? {}) as Record<string, unknown>;
    const verifiedAmount = money(verified.amount || verified.charged_amount);
    if (!verificationResponse.ok || text(verification.status) !== "success" || text(verified.status) !== "successful" || text(verified.tx_ref) !== txRef) throw new Error("Flutterwave could not verify this payment successfully.");
    if (text(verified.currency) && text(verified.currency) !== "NGN") throw new Error("The verified payment currency is not NGN.");
    const expected = money(metadata.expected_amount);
    if (expected > 0 && expected !== verifiedAmount) throw new Error("The verified payment amount does not match the expected amount.");

    const processingStatus = paymentType === "savings_deposit"
      ? await recordSavings(memberId, verifiedAmount, txRef, metadata)
      : paymentType === "loan_repayment"
        ? await recordLoan(memberId, verifiedAmount, txRef, metadata)
        : await recordShares(memberId, verifiedAmount, txRef, metadata);
    await updateLog(log.data.id, processingStatus);
    if (processingStatus === "processed") {
      await admin.from("notifications").insert({
        member_id: memberId,
        title: "Payment confirmed",
        message: `We confirmed your cooperative payment of ₦${verifiedAmount.toLocaleString("en-NG")}. Reference: ${txRef}.`,
        type: "payment_received",
      });
    }
    return json({ ok: true, status: processingStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The webhook could not be processed.";
    await updateLog(log.data.id, "verification_failed", message);
    return json({ message }, 400);
  }
});
