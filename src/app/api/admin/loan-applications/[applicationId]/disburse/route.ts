import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { isFinancialRecordManager } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseMoney } from "@/lib/loans";
import { applicationIdParamsSchema } from "@/lib/validation/api";
import { loanDisbursementSchema } from "@/lib/validation/loans";

export const runtime = "nodejs";

type LoanApplicationRecord = {
  id: string;
  status: "approved" | "disbursed" | "submitted" | "under_review" | "rejected";
  amount_requested: number | string | null;
};

type LoanRecord = {
  id: string;
  principal_amount: number | string | null;
  amount_disbursed: number | string | null;
};

type LoanTransactionRecord = {
  id: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(
  request: NextRequest,
  context: { params: { applicationId: string } },
) {
  const parsedParams = applicationIdParamsSchema.safeParse(context.params);

  if (!parsedParams.success) {
    return jsonError("Invalid loan application reference.", 400);
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the disbursement details.", 400);
  }

  const parsed = loanDisbursementSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the disbursement details and try again.",
      400,
    );
  }

  const sessionClient = createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before disbursing loans.", 401);
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
  const [
    { data: application, error: applicationError },
    { data: loan, error: loanError },
  ] =
    await Promise.all([
      admin
        .from("loan_applications")
        .select("id, status, amount_requested")
        .eq("id", parsedParams.data.applicationId)
        .maybeSingle(),
      admin
        .from("loans")
        .select("id, principal_amount, amount_disbursed")
        .eq("application_id", parsedParams.data.applicationId)
        .maybeSingle(),
    ]);

  if (applicationError || !application) {
    return jsonError("The selected application could not be found.", 404);
  }

  if (loanError || !loan) {
    return jsonError(
      "Approve the application before trying to record a disbursement.",
      409,
    );
  }

  const selectedApplication = application as LoanApplicationRecord;
  const selectedLoan = loan as LoanRecord;
  const principalAmount = parseMoney(selectedLoan.principal_amount);
  const existingDisbursement = parseMoney(selectedLoan.amount_disbursed);

  const { data: existingTransactions, error: existingTransactionsError } = await admin
    .from("loan_transactions")
    .select("id")
    .eq("loan_id", selectedLoan.id)
    .eq("transaction_type", "disbursement");

  if (existingTransactionsError) {
    return jsonError("Unable to verify prior disbursement activity.", 500);
  }

  const hasDisbursementTransaction =
    ((existingTransactions as LoanTransactionRecord[] | null) ?? []).length > 0;

  if (selectedApplication.status !== "approved") {
    return jsonError(
      "Only approved applications can move into disbursement.",
      400,
    );
  }

  if (existingDisbursement > 0 && hasDisbursementTransaction) {
    return jsonError("This loan already has a recorded disbursement.", 409);
  }

  if (parsed.data.amount > principalAmount) {
    return jsonError(
      "Disbursement amount cannot exceed the approved principal amount.",
      400,
    );
  }

  const disbursedAt = new Date().toISOString();

  const updateLoanError =
    existingDisbursement > 0
      ? null
      : (
          await admin
            .from("loans")
            .update({
              amount_disbursed: parsed.data.amount,
              disbursed_at: disbursedAt,
              status: "active",
            })
            .eq("id", selectedLoan.id)
        ).error;

  if (updateLoanError) {
    return jsonError(
      updateLoanError.message ?? "Unable to update the loan disbursement record.",
      500,
    );
  }

  const transactionError = hasDisbursementTransaction
    ? null
    : (
        await admin
          .from("loan_transactions")
          .insert({
            loan_id: selectedLoan.id,
            transaction_type: "disbursement",
            amount: parsed.data.amount,
            payment_reference: parsed.data.transferReference,
            created_by: user.id,
          })
      ).error;

  if (transactionError) {
    return jsonError(
      transactionError.message ?? "Unable to save the disbursement transaction.",
      500,
    );
  }

  const scheduleResult = await admin.functions.invoke("generate-repayment-schedule", {
    body: {
      loanId: selectedLoan.id,
    },
  });

  const scheduleData = scheduleResult.data as { error?: string } | null;

  if (scheduleResult.error || scheduleData?.error) {
    return jsonError(
      scheduleData?.error ??
        scheduleResult.error?.message ??
        "The disbursement was saved, but the repayment schedule could not be refreshed.",
      500,
    );
  }

  const { error: updateApplicationError } = await admin
    .from("loan_applications")
    .update({
      status: "disbursed",
    })
    .eq("id", parsedParams.data.applicationId);

  if (updateApplicationError) {
    return jsonError(
      updateApplicationError.message ??
        "The disbursement was recorded, but the application status could not be updated.",
      500,
    );
  }

  revalidatePath("/admin/loans");
  revalidatePath("/portal/loans");

  return NextResponse.json({
    message: "The disbursement has been recorded and the repayment schedule was refreshed.",
  });
}
