import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { isFinancialRecordManager } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  formatAccountTypeLabel,
  parseSupabaseNumeric,
  type SavingsAccountType,
} from "@/lib/savings";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { savingsTransactionSchema } from "@/lib/validation/savings";

export const runtime = "nodejs";

type SavingsAccountRecord = {
  id: string;
  account_type: SavingsAccountType;
  balance: number | string | null;
  status: "active" | "closed";
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function mapSupabaseMutationError(message: string | undefined) {
  const normalizedMessage = message?.toLowerCase() ?? "";

  if (
    normalizedMessage.includes("insufficient savings balance") ||
    normalizedMessage.includes("does not have an active") ||
    normalizedMessage.includes("not active")
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
    return jsonError("Unable to read the transaction details.", 400);
  }

  const parsed = savingsTransactionSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the transaction details and try again.",
      400,
    );
  }

  const sessionClient = createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before posting a transaction.", 401);
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

  const { data: memberProfile, error: memberProfileError } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", parsed.data.memberId)
    .maybeSingle();

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

  const { data: matchingAccounts, error: matchingAccountsError } = await admin
    .from("savings_accounts")
    .select("id, account_type, balance, status")
    .eq("member_id", parsed.data.memberId)
    .eq("account_type", parsed.data.accountType)
    .order("created_at", { ascending: false });

  if (matchingAccountsError) {
    return jsonError("Unable to load the selected savings account.", 500);
  }

  const activeAccount =
    ((matchingAccounts as SavingsAccountRecord[] | null) ?? []).find(
      (account) => account.status === "active",
    ) ?? null;

  if (parsed.data.transactionType === "withdrawal" && !activeAccount) {
    return jsonError(
      `This member does not have an active ${formatAccountTypeLabel(
        parsed.data.accountType,
      ).toLowerCase()} account yet.`,
      400,
    );
  }

  if (
    parsed.data.transactionType === "withdrawal" &&
    parseSupabaseNumeric(activeAccount?.balance) < parsed.data.amount
  ) {
    return jsonError(
      "Withdrawal amount cannot exceed the current balance on that account.",
      400,
    );
  }

  let savingsAccountId = activeAccount?.id ?? null;
  let createdNewAccount = false;

  if (!savingsAccountId) {
    const { data: createdAccount, error: createdAccountError } = await admin
      .from("savings_accounts")
      .insert({
        member_id: parsed.data.memberId,
        account_type: parsed.data.accountType,
      })
      .select("id")
      .single();

    if (createdAccountError || !createdAccount) {
      return jsonError(
        "Unable to open the savings account required for this deposit.",
        500,
      );
    }

    savingsAccountId = createdAccount.id;
    createdNewAccount = true;
  }

  const { data: transactionRecord, error: transactionError } = await admin
    .from("savings_transactions")
    .insert({
      savings_account_id: savingsAccountId,
      transaction_type: parsed.data.transactionType,
      amount: parsed.data.amount,
      payment_reference: parsed.data.paymentReference ?? null,
      narration: parsed.data.narration ?? null,
      created_by: user.id,
    })
    .select("id, balance_after")
    .single();

  if (transactionError || !transactionRecord) {
    const { message, status } = mapSupabaseMutationError(transactionError?.message);

    return jsonError(
      message ?? "Unable to post the savings transaction right now.",
      status,
    );
  }

  revalidatePath("/admin/finance");
  revalidatePath("/portal/savings");

  const memberName = memberProfile?.full_name ?? "Member";
  const actionLabel =
    parsed.data.transactionType === "deposit" ? "deposit" : "withdrawal";

  return NextResponse.json(
    {
      balanceAfter: parseSupabaseNumeric(transactionRecord.balance_after),
      message: createdNewAccount
        ? `${memberName}'s ${formatAccountTypeLabel(
            parsed.data.accountType,
          ).toLowerCase()} account was opened and the ${actionLabel} was posted successfully.`
        : `${memberName}'s ${actionLabel} was posted successfully.`,
    },
    { status: 201 },
  );
}
