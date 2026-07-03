import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { isFinancialRecordManager } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseSupabaseNumeric } from "@/lib/shares";
import {
  composeTransactionReference,
  generateTransactionReference,
} from "@/lib/transaction-references";
import { sharePurchaseSchema } from "@/lib/validation/shares";

export const runtime = "nodejs";

type ShareConfigRecord = {
  share_value: number | string | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function mapSupabaseMutationError(message: string | undefined) {
  const normalizedMessage = message?.toLowerCase() ?? "";

  if (
    normalizedMessage.includes("share configuration is not set") ||
    normalizedMessage.includes("share transaction amount") ||
    normalizedMessage.includes("insufficient shares")
  ) {
    return {
      message,
      status: 400,
    };
  }

  return {
    message,
    status: 500,
  };
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the share purchase details.", 400);
  }

  const parsed = sharePurchaseSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the share purchase details and try again.",
      400,
    );
  }

  const sessionClient = createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before recording a share purchase.", 401);
  }

  const { data: adminProfile } = await sessionClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!isFinancialRecordManager(adminProfile?.role)) {
    return jsonError(
      "Admin or treasurer access is required for this financial action.",
      403,
    );
  }

  const admin = createSupabaseAdminClient();

  const [{ data: memberProfile, error: memberProfileError }, { data: shareConfig, error: shareConfigError }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("full_name")
        .eq("id", parsed.data.memberId)
        .maybeSingle(),
      admin
        .from("share_config")
        .select("share_value")
        .limit(1)
        .maybeSingle(),
    ]);

  if (memberProfileError) {
    return jsonError("Unable to verify the selected member.", 500);
  }

  const { data: memberRecord, error: memberRecordError } = await admin
    .from("members")
    .select("id")
    .eq("id", parsed.data.memberId)
    .maybeSingle();

  if (memberRecordError || !memberRecord) {
    return jsonError("The selected member could not be found.", 404);
  }

  if (shareConfigError || !shareConfig) {
    return jsonError("Share configuration is missing. Add it in Supabase first.", 500);
  }

  const amount =
    parsed.data.sharesCount *
    parseSupabaseNumeric((shareConfig as ShareConfigRecord).share_value);
  const paymentReference = composeTransactionReference(
    await generateTransactionReference(admin),
    parsed.data.paymentReference,
  );

  const { error: purchaseError } = await admin.from("share_transactions").insert({
    member_id: parsed.data.memberId,
    transaction_type: "purchase",
    shares_count: parsed.data.sharesCount,
    amount,
    payment_reference: paymentReference,
    created_by: user.id,
    notes: parsed.data.notes ?? null,
  });

  if (purchaseError) {
    const { message, status } = mapSupabaseMutationError(purchaseError.message);
    return jsonError(
      message ?? "Unable to record the share purchase right now.",
      status,
    );
  }

  revalidatePath("/admin/shares");

  return NextResponse.json(
    {
      message: `${memberProfile?.full_name ?? "Member"}'s share purchase was recorded successfully.`,
    },
    { status: 201 },
  );
}
