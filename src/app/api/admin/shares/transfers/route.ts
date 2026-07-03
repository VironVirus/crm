import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { isFinancialRecordManager } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  composeTransactionReference,
  generateTransactionReference,
} from "@/lib/transaction-references";
import { shareTransferSchema } from "@/lib/validation/shares";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function mapSupabaseMutationError(message: string | undefined) {
  const normalizedMessage = message?.toLowerCase() ?? "";

  if (
    normalizedMessage.includes("insufficient shares") ||
    normalizedMessage.includes("different members") ||
    normalizedMessage.includes("share configuration is not set")
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
    return jsonError("Unable to read the share transfer details.", 400);
  }

  const parsed = shareTransferSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the share transfer details and try again.",
      400,
    );
  }

  const sessionClient = createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before transferring shares.", 401);
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

  const [{ data: senderProfile, error: senderProfileError }, { data: recipientProfile, error: recipientProfileError }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("full_name")
        .eq("id", parsed.data.fromMemberId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("full_name")
        .eq("id", parsed.data.toMemberId)
        .maybeSingle(),
    ]);

  if (senderProfileError || recipientProfileError) {
    return jsonError("Unable to verify the selected members for transfer.", 500);
  }

  const paymentReference = composeTransactionReference(
    await generateTransactionReference(admin),
    parsed.data.paymentReference,
  );

  const { error: transferError } = await admin.rpc("transfer_member_shares", {
    p_from_member_id: parsed.data.fromMemberId,
    p_to_member_id: parsed.data.toMemberId,
    p_shares_count: parsed.data.sharesCount,
    p_payment_reference: paymentReference,
    p_created_by: user.id,
    p_notes: parsed.data.notes ?? null,
  });

  if (transferError) {
    const { message, status } = mapSupabaseMutationError(transferError.message);
    return jsonError(
      message ?? "Unable to transfer the selected shares right now.",
      status,
    );
  }

  revalidatePath("/admin/shares");

  return NextResponse.json(
    {
      message: `${parsed.data.sharesCount} share unit${
        parsed.data.sharesCount === 1 ? "" : "s"
      } moved from ${senderProfile?.full_name ?? "the sender"} to ${
        recipientProfile?.full_name ?? "the recipient"
      }.`,
    },
    { status: 201 },
  );
}
