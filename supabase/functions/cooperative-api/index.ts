import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const KYC_BUCKET = "member-kyc";
const KYC_MAX_BYTES = 1024 * 1024;
const FINANCE_ROLES = new Set(["admin", "treasurer"]);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
  "access-control-allow-origin": "*",
};

type AppUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  role: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ message, ...extra }, status);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function amount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function transactionReference(externalReference?: unknown) {
  const generated = `IMPCS-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const supplied = text(externalReference);
  return supplied ? `${generated} | ${supplied}` : generated;
}

function memberTier(member: Record<string, unknown> | null) {
  if (
    !member ||
    !text(member.next_of_kin_name) ||
    !text(member.next_of_kin_phone) ||
    !text(member.next_of_kin_relationship)
  ) {
    return "tier_1";
  }

  if (
    !text(member.national_id_path) ||
    !text(member.passport_photo_path) ||
    !text(member.utility_bill_path)
  ) {
    return "tier_2";
  }

  return "tier_3";
}

async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function currentUser(request: Request): Promise<AppUser | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  const { data, error } = await admin.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  return {
    id: data.user.id,
    email: data.user.email,
    email_confirmed_at: data.user.email_confirmed_at,
    role: profile?.role ?? "member",
  };
}

async function requireUser(request: Request) {
  const user = await currentUser(request);
  return user ? { user } : { response: fail("You need to sign in to continue.", 401) };
}

async function requireAdmin(request: Request) {
  const result = await requireUser(request);
  if ("response" in result) return result;
  return result.user.role === "admin"
    ? result
    : { response: fail("Only administrators can complete this action.", 403) };
}

async function requireFinanceManager(request: Request) {
  const result = await requireUser(request);
  if ("response" in result) return result;
  return FINANCE_ROLES.has(result.user.role)
    ? result
    : { response: fail("Admin or treasurer access is required for this action.", 403) };
}

async function notifyMember(
  memberId: string,
  title: string,
  message: string,
  type:
    | "attendance_charge"
    | "dividend_paid"
    | "due_reminder"
    | "guarantor_invite"
    | "loan_approved"
    | "loan_rejected"
    | "meeting_update"
    | "member_verified"
    | "payment_received",
) {
  await admin.from("notifications").insert({ member_id: memberId, title, message, type });
}

async function notifyMany(
  memberIds: string[],
  title: string,
  message: string,
  type: "attendance_charge" | "due_reminder" | "meeting_update",
) {
  if (memberIds.length === 0) return;
  await admin.from("notifications").insert(
    memberIds.map((memberId) => ({ member_id: memberId, title, message, type })),
  );
}

async function activeMemberIds() {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("status", "active")
    .not("member_number", "is", null);
  return (data ?? []).map((row) => row.id as string);
}

async function registrationPreflight(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return fail("Unable to read the registration form submission.");
  const email = text(form.get("email")).toLowerCase();
  if (!email.includes("@")) {
    return fail("Please review the highlighted registration fields.", 400, {
      fieldErrors: { email: ["Enter a valid email address."] },
    });
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id, member_number, role")
    .eq("email", email)
    .maybeSingle();
  if (error) return fail("We could not verify whether this email address is available right now.", 500);
  if (data?.role && data.role !== "member") {
    return fail("This email address is already linked to an existing cooperative account.", 409, {
      fieldErrors: { email: ["This email address already belongs to an existing account."] },
    });
  }
  if (data?.member_number) {
    return fail("This email address is already registered. Please sign in instead.", 409, {
      fieldErrors: { email: ["This email address already belongs to a registered member."] },
    });
  }
  return json({ email, status: data ? "resume" : "ready" });
}

async function completeRegistration(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) {
    return fail("Please confirm your email code before completing registration.", 401);
  }
  const payload = await readJson(request);
  if (!payload) return fail("Unable to read the registration details.");

  const fullName = text(payload.fullName);
  const email = text(payload.email).toLowerCase();
  const phone = text(payload.phone);
  const dateOfBirth = text(payload.dateOfBirth);
  const address = text(payload.address);
  const occupation = text(payload.occupation);
  if (fullName.length < 3 || !email.includes("@") || phone.length < 7 || address.length < 10 || occupation.length < 2 || !dateOfBirth) {
    return fail("Please review the highlighted registration fields.");
  }
  if (!auth.user.email_confirmed_at || auth.user.email?.toLowerCase() !== email) {
    return fail("The verified email does not match the registration details you submitted.", 403);
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("member_number, role, status")
    .eq("id", auth.user.id)
    .maybeSingle();
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: auth.user.id,
      full_name: fullName,
      email,
      phone,
      role: existing?.role ?? "member",
      status: existing?.status ?? "active",
    },
    { onConflict: "id" },
  );
  if (profileError) return fail("Unable to save the member profile.", 500);

  const { error: memberError } = await admin.from("members").upsert(
    {
      id: auth.user.id,
      address,
      date_of_birth: dateOfBirth,
      occupation,
      onboarding_status: "registered",
    },
    { onConflict: "id" },
  );
  if (memberError) return fail("Unable to save the member registration record.", 500);

  let memberNumber = existing?.member_number as string | null;
  if (!memberNumber) {
    const result = await admin.rpc("assign_member_number", { target_profile_id: auth.user.id });
    if (result.error || typeof result.data !== "string") {
      return fail("Unable to generate the member number.", 500);
    }
    memberNumber = result.data;
  }
  return json({ email, fullName, memberNumber }, 201);
}

async function saveNextOfKin(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload) return fail("Unable to read your next of kin details.");
  const name = text(payload.nextOfKinName);
  const phone = text(payload.nextOfKinPhone);
  const relationship = text(payload.nextOfKinRelationship);
  if (name.length < 3 || phone.length < 7 || relationship.length < 2) {
    return fail("Please review your next of kin details and try again.");
  }
  const { data, error } = await admin
    .from("members")
    .update({
      next_of_kin_name: name,
      next_of_kin_phone: phone,
      next_of_kin_relationship: relationship,
    })
    .eq("id", auth.user.id)
    .select("next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path")
    .single();
  if (error || !data) return fail("We could not save your next of kin details right now.", 500);
  return json({ message: "Your next of kin details have been saved.", tier: memberTier(data) });
}

function sanitizeFilename(filename: string) {
  return filename.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function saveKyc(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const form = await request.formData().catch(() => null);
  if (!form) return fail("Unable to read your KYC documents.");
  const fields = [
    { form: "nationalId", column: "national_id_path", accept: ["image/jpeg", "image/png", "image/webp", "application/pdf"] },
    { form: "passportPhoto", column: "passport_photo_path", accept: ["image/jpeg", "image/png", "image/webp"] },
    { form: "utilityBill", column: "utility_bill_path", accept: ["image/jpeg", "image/png", "image/webp", "application/pdf"] },
  ] as const;
  const files = fields.map((field) => ({ field, file: form.get(field.form) })).filter((item) => item.file instanceof File && item.file.size > 0) as Array<{ field: typeof fields[number]; file: File }>;
  if (files.length === 0) return fail("Choose at least one document to upload.");
  for (const { field, file } of files) {
    if (file.size > KYC_MAX_BYTES || !field.accept.includes(file.type as never)) {
      return fail("Each KYC file must be an accepted JPG, PNG, WebP, or PDF file of 1MB or smaller.");
    }
  }
  const { data: current, error: currentError } = await admin
    .from("members")
    .select("next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (currentError || !current) return fail("Your member profile could not be loaded.", 404);

  const update: Record<string, string> = {};
  const uploaded: string[] = [];
  const oldPaths: string[] = [];
  for (const { field, file } of files) {
    const path = `${auth.user.id}/${field.form}/${Date.now()}-${sanitizeFilename(file.name || field.form)}`;
    const result = await admin.storage.from(KYC_BUCKET).upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });
    if (result.error) {
      if (uploaded.length) await admin.storage.from(KYC_BUCKET).remove(uploaded);
      return fail(`Unable to upload ${field.form}.`, 500);
    }
    update[field.column] = path;
    uploaded.push(path);
    const oldPath = current[field.column];
    if (oldPath) oldPaths.push(oldPath as string);
  }
  const { data, error } = await admin
    .from("members")
    .update(update)
    .eq("id", auth.user.id)
    .select("next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path")
    .single();
  if (error || !data) {
    await admin.storage.from(KYC_BUCKET).remove(uploaded);
    return fail("Unable to save your KYC documents.", 500);
  }
  if (oldPaths.length) await admin.storage.from(KYC_BUCKET).remove(oldPaths);
  return json({ message: "Your KYC documents have been uploaded.", tier: memberTier(data) });
}

async function updateMember(request: Request, memberId: string) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload) return fail("Unable to read the member update.");
  const role = text(payload.role);
  const status = text(payload.status);
  const isVerified = payload.isVerified === true;
  if (!["admin", "loan_officer", "treasurer", "member"].includes(role) || !["active", "inactive", "suspended"].includes(status)) {
    return fail("Please review the member update and try again.");
  }
  const { data: member } = await admin
    .from("members")
    .select("national_id_path, passport_photo_path, utility_bill_path")
    .eq("id", memberId)
    .maybeSingle();
  if (!member) return fail("The member record could not be found.", 404);
  if (isVerified && (!member.national_id_path || !member.passport_photo_path || !member.utility_bill_path)) {
    return fail("A member can only be verified after all KYC documents have been uploaded.");
  }
  const { data, error } = await admin
    .from("profiles")
    .update({
      is_verified: isVerified,
      role,
      status,
      verification_note: text(payload.verificationNote) || null,
      verified_at: isVerified ? new Date().toISOString() : null,
      verified_by: isVerified ? auth.user.id : null,
    })
    .eq("id", memberId)
    .select("full_name")
    .single();
  if (error || !data) return fail("Unable to update the member profile.", 500);
  if (isVerified) await notifyMember(memberId, "Member profile verified", "Your KYC documents have been reviewed and your member profile is now verified.", "member_verified");
  return json({ message: `${data.full_name} updated successfully.` });
}

async function cooperativeFinance(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload) return fail("Unable to read the cooperative finance request.");
  const action = text(payload.action);
  const data = (payload.data ?? {}) as Record<string, unknown>;

  if (action === "generate_monthly_dues") {
    const result = await admin.rpc("generate_monthly_member_dues", {
      requested_period: new Date().toISOString().slice(0, 10),
      triggered_by: auth.user.id,
    });
    if (result.error) return fail(result.error.message, 500);
    return json({ message: "This month's ₦10,000 dues are up to date for all active members." });
  }
  if (action === "create_investment_plan") {
    const name = text(data.name);
    if (name.length < 3) return fail("Enter the investment plan name.");
    const result = await admin.from("investment_plans").insert({
      created_by: auth.user.id,
      description: text(data.description) || null,
      ends_on: text(data.endsOn) || null,
      name,
      projected_return_rate: data.projectedReturnRate === null ? null : amount(data.projectedReturnRate),
      starts_on: text(data.startsOn) || null,
    });
    return result.error ? fail(result.error.message, 500) : json({ message: "Investment plan created successfully." });
  }
  if (action === "record_member_investment") {
    const memberId = text(data.memberId);
    const planId = text(data.planId);
    const investedAmount = amount(data.amount);
    const [{ data: member }, { data: plan }] = await Promise.all([
      admin.from("profiles").select("id, status, member_number").eq("id", memberId).maybeSingle(),
      admin.from("investment_plans").select("id, name, status").eq("id", planId).maybeSingle(),
    ]);
    if (!member || member.status !== "active" || !member.member_number) return fail("Choose an active registered member.", 404);
    if (!plan || plan.status !== "active") return fail("Choose an active investment plan.", 404);
    if (investedAmount <= 0) return fail("Enter a valid invested amount.");
    const result = await admin.from("member_investments").insert({
      amount: investedAmount,
      created_by: auth.user.id,
      invested_at: text(data.investedAt),
      investment_plan_id: planId,
      member_id: memberId,
      notes: text(data.notes) || null,
    });
    if (result.error) return fail(result.error.message, 500);
    await notifyMember(memberId, "Investment recorded", `₦${investedAmount.toLocaleString("en-NG")} has been recorded under ${plan.name}. It is now visible on your dashboard.`, "payment_received");
    return json({ message: "Member investment recorded successfully." });
  }
  if (action === "create_occasion_levy") {
    const title = text(data.title);
    const levyAmount = amount(data.amount);
    const scope = text(data.targetScope);
    if (title.length < 3 || levyAmount <= 0 || !["all_members", "single_member"].includes(scope)) return fail("Please review the occasion levy details.");
    const memberIds = scope === "single_member" ? [text(data.targetMemberId)] : await activeMemberIds();
    if (!memberIds[0]) return fail("There are no active registered members for this levy.", 409);
    const levyResult = await admin.from("occasion_levies").insert({
      amount: levyAmount,
      created_by: auth.user.id,
      description: text(data.description) || null,
      due_at: text(data.dueAt) || null,
      target_member_id: scope === "single_member" ? memberIds[0] : null,
      target_scope: scope,
      title,
    }).select("id").single();
    if (levyResult.error || !levyResult.data) return fail(levyResult.error?.message ?? "Unable to create the occasion levy.", 500);
    const charges = memberIds.map((memberId) => ({
      amount: levyAmount,
      charge_category: "occasion_levy",
      created_by: auth.user.id,
      description: text(data.description) || `Cooperative occasion levy: ${title}.`,
      due_at: text(data.dueAt) || null,
      member_id: memberId,
      source_id: levyResult.data.id,
      source_type: "manual",
      status: "pending",
      title,
    }));
    const chargeResult = await admin.from("member_charges").insert(charges);
    if (chargeResult.error) {
      await admin.from("occasion_levies").delete().eq("id", levyResult.data.id);
      return fail(chargeResult.error.message, 500);
    }
    await notifyMany(memberIds, "New occasion levy", `${title}: ₦${levyAmount.toLocaleString("en-NG")} has been added to your cooperative obligations.`, "due_reminder");
    return json({ message: `Occasion levy assigned to ${memberIds.length} member${memberIds.length === 1 ? "" : "s"}.` });
  }
  if (action === "update_charge_status") {
    const status = text(data.status);
    if (!["pending", "paid", "waived"].includes(status)) return fail("Choose a valid charge status.");
    const result = await admin.from("member_charges").update({
      resolved_at: status === "pending" ? null : new Date().toISOString(),
      status,
    }).eq("id", text(data.chargeId));
    return result.error ? fail(result.error.message, 500) : json({ message: "Charge status updated successfully." });
  }
  return fail("Unsupported cooperative finance action.", 404);
}

async function saveShareConfig(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload) return fail("Unable to read the share configuration.");
  const shareValue = amount(payload.shareValue);
  const minimumShares = positiveInteger(payload.minimumShares);
  if (shareValue <= 0 || minimumShares <= 0) return fail("Enter a valid share value and minimum shares.");
  const result = await admin.from("share_config").upsert({ id: true, share_value: shareValue, minimum_shares: minimumShares });
  return result.error ? fail(result.error.message, 500) : json({ message: "Share configuration updated successfully." });
}

async function saveLoanProduct(request: Request, productId?: string) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload) return fail("Unable to read the loan product details.");
  const minAmount = amount(payload.minAmount);
  const maxAmount = amount(payload.maxAmount);
  const minTenure = positiveInteger(payload.minTenureMonths);
  const maxTenure = positiveInteger(payload.maxTenureMonths);
  if (text(payload.name).length < 3 || minAmount <= 0 || maxAmount < minAmount || minTenure <= 0 || maxTenure < minTenure) {
    return fail("Please review the loan product details and try again.");
  }
  const values = {
    name: text(payload.name),
    description: text(payload.description) || null,
    terms_summary: text(payload.termsSummary) || null,
    interest_rate: amount(payload.interestRate),
    interest_type: text(payload.interestType),
    is_active: payload.isActive === true,
    max_amount: maxAmount,
    max_loan_to_savings_ratio: amount(payload.maxLoanToSavingsRatio),
    max_tenure_months: maxTenure,
    maximum_disbursable_amount: payload.maximumDisbursableAmount ? amount(payload.maximumDisbursableAmount) : null,
    min_amount: minAmount,
    min_tenure_months: minTenure,
    penalty_rate: amount(payload.penaltyRate),
    processing_fee_rate: amount(payload.processingFeeRate),
  };
  const result = productId
    ? await admin.from("loan_products").update(values).eq("id", productId)
    : await admin.from("loan_products").insert(values);
  return result.error
    ? fail(result.error.message, 500)
    : json({ message: `Loan product ${productId ? "updated" : "created"} successfully.` }, productId ? 200 : 201);
}

async function savingsTransaction(request: Request) {
  const auth = await requireFinanceManager(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload) return fail("Unable to read the transaction details.");
  const memberId = text(payload.memberId);
  const accountType = text(payload.accountType);
  const transactionType = text(payload.transactionType);
  const transactionAmount = amount(payload.amount);
  if (!memberId || !["mandatory", "voluntary", "fixed_deposit"].includes(accountType) || !["deposit", "withdrawal"].includes(transactionType) || transactionAmount <= 0) {
    return fail("Please review the transaction details and try again.");
  }
  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", memberId).maybeSingle();
  const { data: accounts, error: accountsError } = await admin
    .from("savings_accounts")
    .select("id, balance, status")
    .eq("member_id", memberId)
    .eq("account_type", accountType)
    .order("created_at", { ascending: false });
  if (accountsError) return fail("Unable to load the selected savings account.", 500);
  let account = (accounts ?? []).find((row) => row.status === "active") ?? null;
  if (transactionType === "withdrawal" && !account) return fail("This member does not have an active savings account yet.");
  if (transactionType === "withdrawal" && amount(account?.balance) < transactionAmount) return fail("Withdrawal amount cannot exceed the current balance on that account.");
  let created = false;
  if (!account) {
    const result = await admin.from("savings_accounts").insert({ member_id: memberId, account_type: accountType }).select("id, balance, status").single();
    if (result.error || !result.data) return fail("Unable to open the savings account required for this deposit.", 500);
    account = result.data;
    created = true;
  }
  const result = await admin.from("savings_transactions").insert({
    savings_account_id: account.id,
    transaction_type: transactionType,
    amount: transactionAmount,
    payment_reference: transactionReference(payload.paymentReference),
    narration: text(payload.narration) || null,
    created_by: auth.user.id,
  }).select("balance_after").single();
  if (result.error || !result.data) return fail(result.error?.message ?? "Unable to post the savings transaction.", 500);
  return json({
    balanceAfter: amount(result.data.balance_after),
    message: created ? `${profile?.full_name ?? "Member"}'s savings account was opened and the transaction was posted successfully.` : `${profile?.full_name ?? "Member"}'s transaction was posted successfully.`,
  }, 201);
}

async function sharePurchase(request: Request) {
  const auth = await requireFinanceManager(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload) return fail("Unable to read the share purchase details.");
  const memberId = text(payload.memberId);
  const sharesCount = positiveInteger(payload.sharesCount);
  if (!memberId || sharesCount <= 0) return fail("Please review the share purchase details and try again.");
  const [{ data: profile }, { data: config }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", memberId).maybeSingle(),
    admin.from("share_config").select("share_value").limit(1).maybeSingle(),
  ]);
  if (!config) return fail("Share configuration is missing.", 500);
  const result = await admin.from("share_transactions").insert({
    member_id: memberId,
    transaction_type: "purchase",
    shares_count: sharesCount,
    amount: sharesCount * amount(config.share_value),
    payment_reference: transactionReference(payload.paymentReference),
    created_by: auth.user.id,
    notes: text(payload.notes) || null,
  });
  return result.error ? fail(result.error.message, 500) : json({ message: `${profile?.full_name ?? "Member"}'s share purchase was recorded successfully.` }, 201);
}

async function shareTransfer(request: Request) {
  const auth = await requireFinanceManager(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload) return fail("Unable to read the share transfer details.");
  const fromMemberId = text(payload.fromMemberId);
  const toMemberId = text(payload.toMemberId);
  const sharesCount = positiveInteger(payload.sharesCount);
  if (!fromMemberId || !toMemberId || fromMemberId === toMemberId || sharesCount <= 0) return fail("Please review the share transfer details and try again.");
  const result = await admin.rpc("transfer_member_shares", {
    p_from_member_id: fromMemberId,
    p_to_member_id: toMemberId,
    p_shares_count: sharesCount,
    p_payment_reference: transactionReference(payload.paymentReference),
    p_created_by: auth.user.id,
    p_notes: text(payload.notes) || null,
  });
  return result.error ? fail(result.error.message, 500) : json({ message: `${sharesCount} share unit${sharesCount === 1 ? "" : "s"} transferred successfully.` }, 201);
}

async function declareDividend(request: Request) {
  const auth = await requireFinanceManager(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload) return fail("Unable to read the dividend declaration details.");
  const financialYear = text(payload.financialYear);
  const totalProfit = amount(payload.totalProfit);
  if (financialYear.length < 4 || totalProfit <= 0) return fail("Please review the dividend declaration details.");
  const declaration = await admin.from("dividend_declarations").insert({
    financial_year: financialYear,
    total_profit: totalProfit,
    declared_by: auth.user.id,
    status: "declared",
  }).select("id").single();
  if (declaration.error || !declaration.data) return fail(declaration.error?.message ?? "Unable to declare dividends.", 500);
  const calculation = await admin.functions.invoke("calculate-dividends", { body: { financialYear } });
  if (calculation.error) return fail("The declaration saved, but dividend rows could not be calculated.", 500);
  const { data: payments } = await admin.from("dividend_payments").select("member_id, dividend_amount").eq("dividend_declaration_id", declaration.data.id);
  for (const payment of payments ?? []) {
    await notifyMember(payment.member_id, "Dividend payment recorded", `A dividend payment of ₦${amount(payment.dividend_amount).toLocaleString("en-NG")} has been recorded for ${financialYear}.`, "dividend_paid");
  }
  return json({
    dividendPerShare: (calculation.data as Record<string, unknown> | null)?.dividendPerShare ?? null,
    message: `Dividend declaration saved and ${(payments ?? []).length} member payment row${(payments ?? []).length === 1 ? "" : "s"} were generated.`,
    warnings: [],
  }, 201);
}

async function loadMeeting(meetingId: string) {
  const { data } = await admin
    .from("meetings")
    .select("id, title, starts_at, lateness_starts_at, attendance_closes_at, late_fee, absence_fee, status, created_by, daily_reminder_sent_at, final_reminder_sent_at, location, reminder_message")
    .eq("id", meetingId)
    .maybeSingle();
  return data;
}

async function syncAttendanceCharge(
  meeting: Record<string, unknown>,
  memberId: string,
  status: "present" | "late" | "absent",
  createdBy: string,
) {
  if (status === "present") {
    await admin.from("member_charges").delete().eq("member_id", memberId).eq("source_id", meeting.id).in("source_type", ["meeting_late", "meeting_absence"]);
    return 0;
  }
  const isLate = status === "late";
  const sourceType = isLate ? "meeting_late" : "meeting_absence";
  const opposite = isLate ? "meeting_absence" : "meeting_late";
  const chargeAmount = amount(isLate ? meeting.late_fee : meeting.absence_fee);
  const title = isLate ? "Late meeting attendance charge" : "Missed meeting charge";
  const description = `${isLate ? "Meeting attendance was marked after the lateness cutoff time." : "Meeting attendance was not marked before the close time."} Meeting: ${meeting.title}.`;
  const result = await admin.from("member_charges").upsert({
    amount: chargeAmount,
    charge_category: "meeting_penalty",
    created_by: createdBy,
    description,
    due_at: meeting.attendance_closes_at,
    member_id: memberId,
    source_id: meeting.id,
    source_type: sourceType,
    status: "pending",
    title,
  }, { onConflict: "member_id,source_type,source_id" });
  if (result.error) throw new Error(result.error.message);
  await admin.from("member_charges").delete().eq("member_id", memberId).eq("source_id", meeting.id).eq("source_type", opposite);
  return chargeAmount;
}

async function closeMeeting(meeting: Record<string, unknown>, closedBy: string) {
  const [memberIds, attendanceResult] = await Promise.all([
    activeMemberIds(),
    admin.from("meeting_attendance").select("member_id").eq("meeting_id", meeting.id),
  ]);
  const attended = new Set((attendanceResult.data ?? []).map((row) => row.member_id as string));
  const absentIds = memberIds.filter((memberId) => !attended.has(memberId));
  for (const memberId of absentIds) {
    const chargeAmount = await syncAttendanceCharge(meeting, memberId, "absent", closedBy);
    await admin.from("meeting_attendance").insert({
      charge_amount: chargeAmount,
      is_approved: false,
      marked_at: null,
      marked_by: null,
      meeting_id: meeting.id,
      member_id: memberId,
      notes: null,
      status: "absent",
      updated_at: new Date().toISOString(),
    });
  }
  await admin.from("meetings").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", meeting.id);
  await notifyMany(absentIds, "Meeting attendance charge", `You were marked absent for ${meeting.title}. An absence charge has been added to your dashboard.`, "attendance_charge");
}

function validMeetingPayload(payload: Record<string, unknown>) {
  const startsAt = new Date(text(payload.startsAt));
  const lateAt = new Date(text(payload.latenessStartsAt));
  const closesAt = new Date(text(payload.attendanceClosesAt));
  return text(payload.title).length >= 3 &&
    Number.isFinite(startsAt.getTime()) &&
    lateAt.getTime() >= startsAt.getTime() &&
    closesAt.getTime() > lateAt.getTime() &&
    amount(payload.lateFee) >= 0 &&
    amount(payload.absenceFee) >= 0;
}

function meetingValues(payload: Record<string, unknown>, createdBy?: string) {
  return {
    agenda: text(payload.agenda) || null,
    absence_fee: amount(payload.absenceFee),
    attendance_closes_at: text(payload.attendanceClosesAt),
    ...(createdBy ? { created_by: createdBy } : {}),
    lateness_starts_at: text(payload.latenessStartsAt),
    late_fee: amount(payload.lateFee),
    location: text(payload.location) || null,
    reminder_message: text(payload.reminderMessage) || null,
    starts_at: text(payload.startsAt),
    title: text(payload.title),
    updated_at: new Date().toISOString(),
  };
}

async function createMeeting(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload || !validMeetingPayload(payload)) return fail("Please review the meeting details and try again.");
  const result = await admin.from("meetings").insert(meetingValues(payload, auth.user.id)).select("title, starts_at, location, late_fee, absence_fee").single();
  if (result.error || !result.data) return fail(result.error?.message ?? "Unable to schedule the meeting.", 500);
  const memberIds = await activeMemberIds();
  await notifyMany(memberIds, "New cooperative meeting", `${result.data.title} has been scheduled for ${new Date(result.data.starts_at).toLocaleString("en-NG")}.${result.data.location ? ` Location: ${result.data.location}.` : ""} Late attendance attracts ₦${amount(result.data.late_fee).toLocaleString("en-NG")}; absence attracts ₦${amount(result.data.absence_fee).toLocaleString("en-NG")}.`, "meeting_update");
  return json({ message: "Meeting scheduled successfully." });
}

async function updateMeeting(request: Request, meetingId: string) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload) return fail("Unable to read the meeting update.");
  const meeting = await loadMeeting(meetingId);
  if (!meeting) return fail("The selected meeting could not be found.", 404);
  const action = text(payload.action);
  if (action === "cancel") {
    const result = await admin.from("meetings").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", meetingId);
    return result.error ? fail(result.error.message, 500) : json({ message: "Meeting cancelled successfully." });
  }
  if (action === "close") {
    try {
      await closeMeeting(meeting, auth.user.id);
      return json({ message: "Meeting ended and attendance closed successfully." });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to close the meeting.", 500);
    }
  }
  if (meeting.status !== "scheduled") return fail("Only scheduled meetings can still be edited.", 409);
  if (!validMeetingPayload(payload)) return fail("Please review the meeting details and try again.");
  const result = await admin.from("meetings").update({
    ...meetingValues(payload),
    daily_reminder_sent_at: null,
    final_reminder_sent_at: null,
  }).eq("id", meetingId);
  return result.error ? fail(result.error.message, 500) : json({ message: "Meeting updated successfully." });
}

async function markAttendance(request: Request, meetingId: string) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const meeting = await loadMeeting(meetingId);
  if (!meeting || meeting.status !== "scheduled") return fail("This meeting is not available for attendance anymore.", 409);
  const now = new Date();
  if (now.getTime() > new Date(meeting.attendance_closes_at).getTime()) return fail("Attendance has already closed for this meeting.", 409);
  const status = now.getTime() >= new Date(meeting.lateness_starts_at).getTime() ? "late" : "present";
  try {
    const chargeAmount = await syncAttendanceCharge(meeting, auth.user.id, status, auth.user.id);
    const result = await admin.from("meeting_attendance").upsert({
      approved_at: null,
      approved_by: null,
      charge_amount: chargeAmount,
      is_approved: false,
      marked_at: now.toISOString(),
      marked_by: auth.user.id,
      meeting_id: meetingId,
      member_id: auth.user.id,
      notes: null,
      status,
      updated_at: now.toISOString(),
    }, { onConflict: "meeting_id,member_id" });
    if (result.error) return fail(result.error.message, 500);
    if (status === "late") await notifyMember(auth.user.id, "Late attendance charge added", "Your attendance was marked late, so a meeting penalty has been added to your profile.", "attendance_charge");
    return json({ message: status === "late" ? "Attendance marked successfully. A late charge has been added." : "Attendance marked successfully.", status });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Attendance could not be recorded.", 500);
  }
}

async function approveAttendance(request: Request, meetingId: string, attendanceId: string) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload || typeof payload.isApproved !== "boolean") return fail("Please review the attendance approval.");
  const isApproved = payload.isApproved;
  const result = await admin.from("meeting_attendance").update({
    approved_at: isApproved ? new Date().toISOString() : null,
    approved_by: isApproved ? auth.user.id : null,
    is_approved: isApproved,
    updated_at: new Date().toISOString(),
  }).eq("id", attendanceId).eq("meeting_id", meetingId);
  return result.error ? fail(result.error.message, 500) : json({ message: isApproved ? "Attendance approved successfully." : "Attendance approval removed successfully." });
}

async function sendMeetingReminders(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  const now = new Date();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const { data: meetings } = await admin.from("meetings").select("id, title, starts_at, location, daily_reminder_sent_at, final_reminder_sent_at").eq("status", "scheduled").gte("starts_at", now.toISOString()).lte("starts_at", end.toISOString());
  const memberIds = await activeMemberIds();
  for (const meeting of meetings ?? []) {
    const final = new Date(meeting.starts_at).getTime() - now.getTime() <= 60 * 60 * 1000;
    if ((final && meeting.final_reminder_sent_at) || (!final && meeting.daily_reminder_sent_at)) continue;
    await notifyMany(memberIds, final ? "Meeting starts soon" : "Meeting reminder", `${meeting.title} is scheduled for ${new Date(meeting.starts_at).toLocaleString("en-NG")}.${meeting.location ? ` Location: ${meeting.location}.` : ""}`, "meeting_update");
    await admin.from("meetings").update(final ? { final_reminder_sent_at: now.toISOString() } : { daily_reminder_sent_at: now.toISOString() }).eq("id", meeting.id);
  }
  return json({ message: "Meeting reminders were sent for every due meeting." });
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function loanEstimate(principal: number, annualRate: number, tenure: number, interestType: string) {
  if (interestType === "flat") {
    const interest = roundCurrency(principal * (annualRate / 100) * (tenure / 12));
    return { monthlyRepayment: roundCurrency((principal + interest) / tenure), totalRepayable: roundCurrency(principal + interest) };
  }
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return { monthlyRepayment: roundCurrency(principal / tenure), totalRepayable: principal };
  const repayment = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / (Math.pow(1 + monthlyRate, tenure) - 1);
  return { monthlyRepayment: roundCurrency(repayment), totalRepayable: roundCurrency(roundCurrency(repayment) * tenure) };
}

async function submitLoanApplication(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload) return fail("Unable to read the loan request details.");
  const productId = text(payload.loanProductId);
  const requested = amount(payload.amountRequested);
  const tenure = positiveInteger(payload.tenureMonths);
  const purpose = text(payload.purpose);
  const guarantors = Array.isArray(payload.guarantorMemberIds) ? [...new Set(payload.guarantorMemberIds.map(text).filter(Boolean))].slice(0, 2) : [];
  if (!productId || requested <= 0 || tenure <= 0 || purpose.length < 10) return fail("Please review the loan application details and try again.");

  const [{ data: member }, { data: product }, { data: profile }, { data: savings }] = await Promise.all([
    admin.from("members").select("onboarding_status, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path").eq("id", auth.user.id).maybeSingle(),
    admin.from("loan_products").select("id, name, interest_rate, interest_type, min_amount, max_amount, min_tenure_months, max_tenure_months, max_loan_to_savings_ratio, maximum_disbursable_amount, is_active").eq("id", productId).maybeSingle(),
    admin.from("profiles").select("full_name, status").eq("id", auth.user.id).maybeSingle(),
    admin.from("savings_accounts").select("balance").eq("member_id", auth.user.id).eq("status", "active"),
  ]);
  if (!member || memberTier(member) !== "tier_3") return fail("Complete your profile to Tier 3 before applying for a loan.", 403);
  if (!product || !product.is_active) return fail("The selected loan product is not accepting applications.", 404);
  if (!profile || profile.status !== "active") return fail("Only active members can apply for a loan.", 403);
  const effectiveMaximum = product.maximum_disbursable_amount ? Math.min(amount(product.max_amount), amount(product.maximum_disbursable_amount)) : amount(product.max_amount);
  if (requested < amount(product.min_amount) || requested > effectiveMaximum) return fail("The requested amount is outside this loan product's allowed range.");
  if (tenure < product.min_tenure_months || tenure > product.max_tenure_months) return fail("The selected tenure is outside this loan product's allowed range.");
  const savingsBalance = (savings ?? []).reduce((sum, row) => sum + amount(row.balance), 0);
  if (requested > roundCurrency(savingsBalance * amount(product.max_loan_to_savings_ratio))) return fail("The requested amount exceeds your savings-based loan eligibility.");
  if (guarantors.includes(auth.user.id)) return fail("A member cannot act as guarantor on their own application.");

  const application = await admin.from("loan_applications").insert({
    member_id: auth.user.id,
    loan_product_id: productId,
    amount_requested: requested,
    tenure_months: tenure,
    purpose,
    status: "submitted",
  }).select("id").single();
  if (application.error || !application.data) return fail(application.error?.message ?? "Unable to submit the loan application.", 500);

  const liability = guarantors.length ? roundCurrency(requested / guarantors.length) : 0;
  for (const guarantorId of guarantors) {
    const [{ data: guarantorProfile }, { data: guarantorMember }] = await Promise.all([
      admin.from("profiles").select("status").eq("id", guarantorId).maybeSingle(),
      admin.from("members").select("onboarding_status, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path").eq("id", guarantorId).maybeSingle(),
    ]);
    if (!guarantorProfile || guarantorProfile.status !== "active" || !guarantorMember || memberTier(guarantorMember) !== "tier_3") {
      await admin.from("loan_applications").delete().eq("id", application.data.id);
      return fail("Only active Tier 3 members can act as guarantors.");
    }
    const invite = await admin.from("loan_guarantors").insert({
      loan_application_id: application.data.id,
      guarantor_member_id: guarantorId,
      liability_amount: liability,
      status: "invited",
    });
    if (invite.error) {
      await admin.from("loan_applications").delete().eq("id", application.data.id);
      return fail(invite.error.message, 500);
    }
    await notifyMember(guarantorId, "New guarantor request", `${profile.full_name} listed you as a guarantor for ${product.name}. Review and respond from your member dashboard.`, "guarantor_invite");
  }
  const estimate = loanEstimate(requested, amount(product.interest_rate), tenure, product.interest_type);
  return json({ applicationId: application.data.id, message: `Your application for ${product.name} has been submitted. Estimated monthly repayment: ₦${estimate.monthlyRepayment.toLocaleString("en-NG")}.`, warnings: [] }, 201);
}

async function updateLoanStatus(request: Request, applicationId: string) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  const status = text(payload?.status);
  if (!["submitted", "under_review"].includes(status)) return fail("Please review the status update details.");
  const { data: application } = await admin.from("loan_applications").select("status").eq("id", applicationId).maybeSingle();
  if (!application) return fail("The selected application could not be found.", 404);
  if (["approved", "rejected", "disbursed"].includes(application.status)) return fail("Use the dedicated approve, reject, or disburse action for this application.");
  const values = status === "under_review"
    ? { status, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString(), rejection_reason: null }
    : { status, reviewed_by: null, reviewed_at: null, rejection_reason: null };
  const result = await admin.from("loan_applications").update(values).eq("id", applicationId);
  return result.error ? fail(result.error.message, 500) : json({ message: status === "under_review" ? "The application has moved into review." : "The application has been returned to the submitted queue." });
}

async function approveLoan(request: Request, applicationId: string) {
  const auth = await requireFinanceManager(request);
  if ("response" in auth) return auth.response;
  const { data: application } = await admin
    .from("loan_applications")
    .select("id, member_id, loan_product_id, amount_requested, tenure_months, status")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application) return fail("The selected application could not be found.", 404);
  if (application.status === "rejected" || application.status === "disbursed") return fail("This application cannot be approved in its current state.");
  const [{ data: product }, { data: existingLoan }] = await Promise.all([
    admin.from("loan_products").select("name, interest_rate").eq("id", application.loan_product_id).maybeSingle(),
    admin.from("loans").select("id, amount_disbursed").eq("application_id", applicationId).maybeSingle(),
  ]);
  if (!product) return fail("The loan product attached to this application was not found.", 404);
  if (existingLoan && amount(existingLoan.amount_disbursed) > 0) return fail("This loan has already recorded a disbursement.", 409);
  const values = {
    application_id: application.id,
    member_id: application.member_id,
    principal_amount: amount(application.amount_requested),
    interest_rate: amount(product.interest_rate),
    tenure_months: application.tenure_months,
    status: "active",
  };
  const mutation = existingLoan
    ? await admin.from("loans").update(values).eq("id", existingLoan.id).select("id").single()
    : await admin.from("loans").insert(values).select("id").single();
  if (mutation.error || !mutation.data) return fail(mutation.error?.message ?? "Unable to create the loan approval record.", 500);
  const schedule = await admin.functions.invoke("generate-repayment-schedule", { body: { loanId: mutation.data.id } });
  const scheduleData = (schedule.data ?? {}) as Record<string, unknown>;
  if (schedule.error || scheduleData.error) return fail(text(scheduleData.error) || schedule.error?.message || "Unable to generate the repayment schedule.", 500);
  const now = new Date().toISOString();
  const update = await admin.from("loan_applications").update({
    status: "approved",
    reviewed_by: auth.user.id,
    reviewed_at: now,
    approved_by: auth.user.id,
    approved_at: now,
    rejection_reason: null,
  }).eq("id", applicationId);
  if (update.error) return fail(update.error.message, 500);
  await notifyMember(application.member_id, "Loan application approved", `Your ${product.name} application has been approved. Your repayment schedule is now available in your dashboard.`, "loan_approved");
  return json({ message: "The loan was approved and a repayment schedule has been generated.", loanId: mutation.data.id, monthlyRepayment: scheduleData.monthlyRepayment ?? null, warnings: [] });
}

async function rejectLoan(request: Request, applicationId: string) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  const reason = text(payload?.rejectionReason);
  if (reason.length < 10) return fail("Add a clear reason for the rejection.");
  const { data: application } = await admin.from("loan_applications").select("member_id, status, loan_product:loan_products(name)").eq("id", applicationId).maybeSingle();
  if (!application) return fail("The selected application could not be found.", 404);
  if (["approved", "disbursed"].includes(application.status)) return fail("Approved or disbursed applications cannot be rejected from this workflow.");
  const result = await admin.from("loan_applications").update({
    status: "rejected",
    reviewed_by: auth.user.id,
    reviewed_at: new Date().toISOString(),
    rejection_reason: reason,
  }).eq("id", applicationId);
  if (result.error) return fail(result.error.message, 500);
  const relation = Array.isArray(application.loan_product) ? application.loan_product[0] : application.loan_product;
  await notifyMember(application.member_id, "Loan application not approved", `Your ${relation?.name ?? "loan"} application was not approved. Reason: ${reason}.`, "loan_rejected");
  return json({ message: "The application has been rejected and the reason has been saved.", warnings: [] });
}

async function disburseLoan(request: Request, applicationId: string) {
  const auth = await requireFinanceManager(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload) return fail("Unable to read the disbursement details.");
  const disbursementAmount = amount(payload.amount);
  const transferReference = text(payload.transferReference);
  if (disbursementAmount <= 0 || transferReference.length < 3 || text(payload.narration).length < 5) return fail("Please review the disbursement details and try again.");
  const [{ data: application }, { data: loan }] = await Promise.all([
    admin.from("loan_applications").select("status").eq("id", applicationId).maybeSingle(),
    admin.from("loans").select("id, principal_amount, amount_disbursed").eq("application_id", applicationId).maybeSingle(),
  ]);
  if (!application) return fail("The selected application could not be found.", 404);
  if (!loan) return fail("Approve the application before trying to record a disbursement.", 409);
  if (application.status !== "approved") return fail("Only approved applications can move into disbursement.");
  if (amount(loan.amount_disbursed) > 0) return fail("This loan already has a recorded disbursement.", 409);
  if (disbursementAmount > amount(loan.principal_amount)) return fail("Disbursement amount cannot exceed the approved principal amount.");
  const update = await admin.from("loans").update({ amount_disbursed: disbursementAmount, disbursed_at: new Date().toISOString(), status: "active" }).eq("id", loan.id);
  if (update.error) return fail(update.error.message, 500);
  const transaction = await admin.from("loan_transactions").insert({
    loan_id: loan.id,
    transaction_type: "disbursement",
    amount: disbursementAmount,
    payment_reference: transactionReference(transferReference),
    created_by: auth.user.id,
  });
  if (transaction.error) return fail(transaction.error.message, 500);
  const schedule = await admin.functions.invoke("generate-repayment-schedule", { body: { loanId: loan.id } });
  if (schedule.error) return fail("The disbursement saved, but the repayment schedule could not be refreshed.", 500);
  const result = await admin.from("loan_applications").update({ status: "disbursed" }).eq("id", applicationId);
  return result.error ? fail(result.error.message, 500) : json({ message: "The disbursement has been recorded and the repayment schedule was refreshed." });
}

async function respondToGuarantorRequest(request: Request, requestId: string) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  const decision = text(payload?.decision);
  if (!["accepted", "declined"].includes(decision)) return fail("Please review the guarantor response.");
  const { data: guarantor } = await admin.from("loan_guarantors").select("loan_application_id, guarantor_member_id, status").eq("id", requestId).maybeSingle();
  if (!guarantor) return fail("The selected guarantor request could not be found.", 404);
  if (guarantor.guarantor_member_id !== auth.user.id) return fail("This guarantor request does not belong to your account.", 403);
  if (guarantor.status !== "invited") return fail("This guarantor request has already been responded to.");
  if (decision === "accepted") {
    const [{ data: profile }, { data: member }, { data: application }] = await Promise.all([
      admin.from("profiles").select("status").eq("id", auth.user.id).maybeSingle(),
      admin.from("members").select("onboarding_status, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path").eq("id", auth.user.id).maybeSingle(),
      admin.from("loan_applications").select("status").eq("id", guarantor.loan_application_id).maybeSingle(),
    ]);
    if (!profile || profile.status !== "active" || !member || memberTier(member) !== "tier_3") return fail("Only active Tier 3 members can accept guarantor requests.", 403);
    if (!application || ["rejected", "disbursed", "closed"].includes(application.status)) return fail("This loan request is no longer open for guarantor acceptances.");
    const { data: accepted } = await admin.from("loan_guarantors").select("loan_application_id").eq("guarantor_member_id", auth.user.id).eq("status", "accepted").is("released_at", null);
    const ids = (accepted ?? []).map((row) => row.loan_application_id);
    if (ids.length) {
      const { data: activeLoans } = await admin.from("loans").select("application_id").in("application_id", ids).in("status", ["active", "defaulted"]);
      if ((activeLoans ?? []).length >= 2) return fail("You are already guaranteeing 2 active loans and cannot accept another one right now.");
    }
  }
  const result = await admin.from("loan_guarantors").update({ status: decision, responded_at: new Date().toISOString() }).eq("id", requestId);
  return result.error ? fail(result.error.message, 500) : json({ message: decision === "accepted" ? "You have accepted this guarantor request." : "You have declined this guarantor request." });
}

async function initiatePayment(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const payload = await readJson(request);
  if (!payload) return fail("Unable to read the payment details.");
  const memberId = text(payload.member_id);
  const paymentType = text(payload.payment_type);
  const paymentAmount = amount(payload.amount);
  const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
  if (memberId !== auth.user.id) return fail("You can only initiate payments for your own member account.", 403);
  if (!new Set(["savings_deposit", "loan_repayment", "share_purchase"]).has(paymentType) || paymentAmount <= 0) return fail("Please review the payment details and try again.");
  const [{ data: profile }, { data: member }] = await Promise.all([
    admin.from("profiles").select("full_name, email, phone, member_number, status").eq("id", memberId).maybeSingle(),
    admin.from("members").select("onboarding_status, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path").eq("id", memberId).maybeSingle(),
  ]);
  if (!profile || !member) return fail("Complete your member registration before collecting payments online.", 404);
  if (profile.status !== "active" || member.onboarding_status !== "registered") return fail("Only active registered members can start new payments.", 403);
  if (["loan_repayment", "share_purchase"].includes(paymentType) && memberTier(member) !== "tier_3") return fail("Complete your profile to Tier 3 before making this payment.", 403);

  const rate = await admin.rpc("check_payment_initiation_rate_limit", { p_limit: 5, p_member_id: memberId, p_window_seconds: 60 });
  if (!rate.error && (rate.data as Record<string, unknown> | null)?.allowed === false) return fail("Too many payment attempts. Please wait a minute before trying again.", 429);

  const txRef = transactionReference();
  const gatewayMeta: Record<string, unknown> = {
    ...metadata,
    expected_amount: paymentAmount,
    member_id: memberId,
    member_number: profile.member_number,
    payment_type: paymentType,
  };
  let description = "Cooperative payment";
  if (paymentType === "savings_deposit") {
    const accountType = text(metadata.account_type);
    if (!["mandatory", "voluntary", "fixed_deposit"].includes(accountType)) return fail("Choose a valid savings account type.");
    description = "Cooperative savings deposit";
  } else if (paymentType === "loan_repayment") {
    const loanId = text(metadata.loan_id);
    const { data: loan } = await admin.from("loans").select("outstanding_balance, status").eq("id", loanId).eq("member_id", memberId).maybeSingle();
    if (!loan || !["active", "defaulted"].includes(loan.status)) return fail("The selected active loan could not be found.", 404);
    if (paymentAmount > amount(loan.outstanding_balance)) return fail("Repayment amount cannot exceed your current outstanding balance.");
    description = "Cooperative loan repayment";
  } else {
    const { data: config } = await admin.from("share_config").select("share_value, minimum_shares").limit(1).maybeSingle();
    const shareValue = amount(config?.share_value);
    const sharesCount = Math.round(paymentAmount / shareValue);
    if (!config || shareValue <= 0 || Math.abs(paymentAmount / shareValue - sharesCount) > 0.000001 || sharesCount < config.minimum_shares) return fail("Share payment must match the configured share unit value and minimum exactly.");
    gatewayMeta.shares_count = sharesCount;
    gatewayMeta.share_value = shareValue;
    description = `Share purchase for ${sharesCount} unit${sharesCount === 1 ? "" : "s"}`;
  }

  const secretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
  const appUrl = (Deno.env.get("APP_URL") ?? "https://impcs.consolish.com").replace(/\/$/, "");
  if (!secretKey) return fail("Online payments are not configured yet. Add FLUTTERWAVE_SECRET_KEY to the Supabase Edge Function secrets.", 503);
  const response = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: { authorization: `Bearer ${secretKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      tx_ref: txRef,
      amount: paymentAmount,
      currency: "NGN",
      redirect_url: `${appUrl}/portal/actions/?payment=success`,
      customer: { email: profile.email, name: profile.full_name, phonenumber: profile.phone },
      customizations: { title: "Ifemelunma Multi-Purpose Co-operative Society", description },
      meta: gatewayMeta,
    }),
  });
  const result = await response.json().catch(() => null) as Record<string, unknown> | null;
  const data = result?.data as Record<string, unknown> | undefined;
  if (!response.ok || !text(data?.link)) return fail(text(result?.message) || "We could not start the payment checkout right now.", 502);
  return json({ paymentLink: data?.link, txRef });
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

async function memberStatement(request: Request, requestedMemberId?: string) {
  const auth = requestedMemberId ? await requireAdmin(request) : await requireUser(request);
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  const memberId = requestedMemberId ?? auth.user.id;
  const startDate = url.searchParams.get("start_date") || `${new Date().getUTCFullYear()}-01-01`;
  const endDate = url.searchParams.get("end_date") || new Date().toISOString().slice(0, 10);
  const start = `${startDate}T00:00:00.000Z`;
  const end = `${endDate}T23:59:59.999Z`;
  const [{ data: profile }, { data: accounts }, { data: loans }, { data: shares }] = await Promise.all([
    admin.from("profiles").select("full_name, member_number, email, phone, status").eq("id", memberId).maybeSingle(),
    admin.from("savings_accounts").select("id, account_type, balance").eq("member_id", memberId),
    admin.from("loans").select("id, outstanding_balance, application_id").eq("member_id", memberId),
    admin.from("member_shares").select("total_shares, total_value").eq("member_id", memberId).maybeSingle(),
  ]);
  if (!profile) return fail("The selected member could not be found.", 404);
  const accountIds = (accounts ?? []).map((row) => row.id);
  const loanIds = (loans ?? []).map((row) => row.id);
  const [savingsResult, loanResult, dividendsResult] = await Promise.all([
    accountIds.length ? admin.from("savings_transactions").select("transaction_date, transaction_type, amount, balance_after, payment_reference, savings_account_id").in("savings_account_id", accountIds).gte("transaction_date", start).lte("transaction_date", end).order("transaction_date") : Promise.resolve({ data: [] }),
    loanIds.length ? admin.from("loan_transactions").select("transaction_date, transaction_type, amount, payment_reference, loan_id").in("loan_id", loanIds).gte("transaction_date", start).lte("transaction_date", end).order("transaction_date") : Promise.resolve({ data: [] }),
    admin.from("dividend_payments").select("dividend_amount, shares_at_declaration, paid_at, payment_reference").eq("member_id", memberId).gte("paid_at", start).lte("paid_at", end),
  ]);
  const accountMap = new Map((accounts ?? []).map((row) => [row.id, row.account_type]));
  const rows: unknown[][] = [
    ["IFEMELUNMA MEMBER STATEMENT"],
    ["Member", profile.full_name],
    ["Member number", profile.member_number],
    ["Period", `${startDate} to ${endDate}`],
    ["Total shares", shares?.total_shares ?? 0],
    ["Share value", amount(shares?.total_value)],
    [],
    ["Date", "Category", "Type", "Amount", "Balance/Units", "Reference"],
  ];
  for (const row of savingsResult.data ?? []) rows.push([row.transaction_date, `Savings - ${accountMap.get(row.savings_account_id) ?? "account"}`, row.transaction_type, amount(row.amount), amount(row.balance_after), row.payment_reference]);
  for (const row of loanResult.data ?? []) rows.push([row.transaction_date, "Loan", row.transaction_type, amount(row.amount), "", row.payment_reference]);
  for (const row of dividendsResult.data ?? []) rows.push([row.paid_at, "Dividend", "payment", amount(row.dividend_amount), row.shares_at_declaration, row.payment_reference]);
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const filename = `ifemelunma-member-statement-${profile.member_number ?? memberId}-${startDate}-${endDate}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      ...corsHeaders,
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": "text/csv; charset=utf-8",
    },
  });
}

async function portalLoanSupport(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const [{ data: profiles }, { data: members }, { data: applications }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, phone, member_number, status").not("member_number", "is", null),
    admin.from("members").select("id, onboarding_status, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path").eq("onboarding_status", "registered"),
    admin.from("loan_applications").select("id").eq("member_id", auth.user.id),
  ]);
  const eligibleIds = new Set((members ?? []).filter((member) => memberTier(member) === "tier_3").map((member) => member.id));
  const applicationIds = (applications ?? []).map((application) => application.id);
  const { data: guarantors } = applicationIds.length
    ? await admin.from("loan_guarantors").select("guarantor_member_id").in("loan_application_id", applicationIds)
    : { data: [] };
  const attachedIds = new Set((guarantors ?? []).map((row) => row.guarantor_member_id));
  const profileRows = profiles ?? [];
  return json({
    candidates: profileRows.filter((profile) => profile.id !== auth.user.id && profile.status === "active" && eligibleIds.has(profile.id)),
    profiles: profileRows.filter((profile) => attachedIds.has(profile.id)),
  });
}

async function portalFinancialRecords(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [profilesResult, accountsResult, entriesResult, savingsResult, loansResult, sharesResult, savingsCollectionsResult, loanCollectionsResult, shareCollectionsResult] = await Promise.all([
    admin.from("profiles").select("id, full_name, member_number").not("member_number", "is", null).order("full_name"),
    admin.from("accounts").select("id, account_code, account_name, account_type").order("account_code"),
    admin.from("journal_entries").select("id").eq("status", "posted"),
    admin.from("savings_accounts").select("member_id, balance").eq("status", "active"),
    admin.from("loans").select("member_id, outstanding_balance").in("status", ["active", "defaulted"]),
    admin.from("member_shares").select("member_id, total_value"),
    admin.from("savings_transactions").select("amount").eq("transaction_type", "deposit").gte("transaction_date", monthStart.toISOString()),
    admin.from("loan_transactions").select("amount").eq("transaction_type", "repayment").gte("transaction_date", monthStart.toISOString()),
    admin.from("share_transactions").select("amount").eq("transaction_type", "purchase").gte("transaction_date", monthStart.toISOString()),
  ]);
  const entryIds = (entriesResult.data ?? []).map((entry) => entry.id);
  const linesResult = entryIds.length
    ? await admin.from("journal_lines").select("account_id, debit_amount, credit_amount").in("journal_entry_id", entryIds)
    : { data: [], error: null };
  const accountTotals = new Map<string, { debit: number; credit: number }>();
  for (const line of linesResult.data ?? []) {
    const current = accountTotals.get(line.account_id) ?? { debit: 0, credit: 0 };
    current.debit += amount(line.debit_amount);
    current.credit += amount(line.credit_amount);
    accountTotals.set(line.account_id, current);
  }
  const accountRows = (accountsResult.data ?? []).map((account) => {
    const totals = accountTotals.get(account.id) ?? { debit: 0, credit: 0 };
    const balance = ["asset", "expense"].includes(account.account_type) ? totals.debit - totals.credit : totals.credit - totals.debit;
    return { accountCode: account.account_code, accountName: account.account_name, accountType: account.account_type, balance, debit: totals.debit, credit: totals.credit };
  });
  const totalsByType = { asset: 0, equity: 0, expense: 0, income: 0, liability: 0 } as Record<string, number>;
  for (const row of accountRows) totalsByType[row.accountType] = (totalsByType[row.accountType] ?? 0) + row.balance;
  const sumByMember = (rows: Array<Record<string, unknown>>, valueColumn: string) => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(String(row.member_id), (map.get(String(row.member_id)) ?? 0) + amount(row[valueColumn]));
    return map;
  };
  const savingsByMember = sumByMember(savingsResult.data ?? [], "balance");
  const loansByMember = sumByMember(loansResult.data ?? [], "outstanding_balance");
  const sharesByMember = sumByMember(sharesResult.data ?? [], "total_value");
  const memberExposureRows = (profilesResult.data ?? []).map((profile) => ({
    fullName: profile.full_name,
    memberNumber: profile.member_number,
    savings: savingsByMember.get(profile.id) ?? 0,
    loans: loansByMember.get(profile.id) ?? 0,
    shares: sharesByMember.get(profile.id) ?? 0,
  }));
  const collectionRows = [...(savingsCollectionsResult.data ?? []), ...(loanCollectionsResult.data ?? []), ...(shareCollectionsResult.data ?? [])];
  const dataError = [profilesResult.error, accountsResult.error, entriesResult.error, savingsResult.error, loansResult.error, sharesResult.error, savingsCollectionsResult.error, loanCollectionsResult.error, shareCollectionsResult.error, linesResult.error].map((error) => error?.message).filter(Boolean).join(" ");
  return json({
    accountRows,
    collectionsThisMonth: collectionRows.reduce((total, row) => total + amount(row.amount), 0),
    dataError,
    donationTotal: accountRows.filter((row) => /donation|grant/i.test(row.accountName)).reduce((total, row) => total + row.balance, 0),
    memberExposureRows,
    totalsByType,
  });
}

function normalizedPath(url: string) {
  const pathname = new URL(url).pathname;
  const marker = "/cooperative-api";
  const index = pathname.indexOf(marker);
  const path = index >= 0 ? pathname.slice(index + marker.length) : pathname;
  return path.replace(/\/+$/, "") || "/";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return fail("Supabase Edge Function environment is incomplete.", 500);
  const path = normalizedPath(request.url);

  try {
    if (request.method === "GET" && path === "/health") return json({ ok: true, runtime: "supabase-edge", service: "ifemelunma-cooperative-api" });
    if (request.method === "POST" && path === "/member-registration") return registrationPreflight(request);
    if (request.method === "POST" && path === "/member-registration/complete") return completeRegistration(request);
    if (request.method === "POST" && path === "/portal/profile/next-of-kin") return saveNextOfKin(request);
    if (request.method === "POST" && path === "/portal/profile/kyc") return saveKyc(request);
    if (request.method === "POST" && path === "/admin/cooperative-finance") return cooperativeFinance(request);
    if (request.method === "PATCH" && path === "/admin/share-config") return saveShareConfig(request);
    if (request.method === "POST" && path === "/admin/loan-products") return saveLoanProduct(request);
    if (request.method === "POST" && path === "/admin/savings/transactions") return savingsTransaction(request);
    if (request.method === "POST" && path === "/admin/shares/purchases") return sharePurchase(request);
    if (request.method === "POST" && path === "/admin/shares/transfers") return shareTransfer(request);
    if (request.method === "POST" && path === "/admin/shares/dividends") return declareDividend(request);
    if (request.method === "POST" && path === "/admin/meetings") return createMeeting(request);
    if (request.method === "POST" && path === "/admin/meetings/reminders") return sendMeetingReminders(request);
    if (request.method === "POST" && path === "/loan-applications") return submitLoanApplication(request);
    if (request.method === "POST" && path === "/payments/initiate") return initiatePayment(request);
    if (request.method === "GET" && path === "/portal/reports/member-statement") return memberStatement(request);
    if (request.method === "GET" && path === "/portal/loan-support") return portalLoanSupport(request);
    if (request.method === "GET" && path === "/portal/reports/financial-records") return portalFinancialRecords(request);

    let match = path.match(/^\/admin\/members\/([^/]+)$/);
    if (request.method === "PATCH" && match) return updateMember(request, match[1]);
    match = path.match(/^\/admin\/loan-products\/([^/]+)$/);
    if (request.method === "PATCH" && match) return saveLoanProduct(request, match[1]);
    match = path.match(/^\/admin\/meetings\/([^/]+)$/);
    if (request.method === "PATCH" && match) return updateMeeting(request, match[1]);
    match = path.match(/^\/portal\/meetings\/([^/]+)\/attendance$/);
    if (request.method === "POST" && match) return markAttendance(request, match[1]);
    match = path.match(/^\/admin\/meetings\/([^/]+)\/attendance\/([^/]+)$/);
    if (request.method === "PATCH" && match) return approveAttendance(request, match[1], match[2]);
    match = path.match(/^\/admin\/loan-applications\/([^/]+)\/status$/);
    if (request.method === "PATCH" && match) return updateLoanStatus(request, match[1]);
    match = path.match(/^\/admin\/loan-applications\/([^/]+)\/approve$/);
    if (request.method === "POST" && match) return approveLoan(request, match[1]);
    match = path.match(/^\/admin\/loan-applications\/([^/]+)\/reject$/);
    if (request.method === "POST" && match) return rejectLoan(request, match[1]);
    match = path.match(/^\/admin\/loan-applications\/([^/]+)\/disburse$/);
    if (request.method === "POST" && match) return disburseLoan(request, match[1]);
    match = path.match(/^\/guarantor-requests\/([^/]+)\/respond$/);
    if (request.method === "POST" && match) return respondToGuarantorRequest(request, match[1]);
    match = path.match(/^\/admin\/reports\/member-statement$/);
    if (request.method === "GET" && match) {
      const memberId = new URL(request.url).searchParams.get("member_id") ?? "";
      return memberStatement(request, memberId);
    }

    if (path === "/payments/mock/complete") return fail("Mock payments are disabled on the production static site.", 410);
    return fail("This cooperative action is not available.", 404);
  } catch (error) {
    console.error("cooperative-api error", error);
    return fail(error instanceof Error ? error.message : "The cooperative service could not complete this request.", 500);
  }
});
