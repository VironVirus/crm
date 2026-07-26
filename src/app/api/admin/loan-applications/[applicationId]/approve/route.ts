import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isFinancialRecordManager } from "@/lib/auth/roles";
import { sendMemberNotification } from "@/lib/notification-dispatch";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  formatNaira,
  parseMoney,
  type LoanInterestType,
} from "@/lib/loans";
import { applicationIdParamsSchema } from "@/lib/validation/api";

export const runtime = "nodejs";

type LoanApplicationRecord = {
  id: string;
  member_id: string;
  loan_product_id: string;
  amount_requested: number | string | null;
  tenure_months: number;
  status:
    | "submitted"
    | "under_review"
    | "approved"
    | "rejected"
    | "disbursed";
};

type LoanProductRecord = {
  name: string;
  interest_rate: number | string | null;
  interest_type: LoanInterestType;
};

type LoanRecord = {
  id: string;
  amount_disbursed: number | string | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const parsedParams = applicationIdParamsSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return jsonError("Invalid loan application reference.", 400);
  }

  const sessionClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before approving loan applications.", 401);
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
  const { data: application, error: applicationError } = await admin
    .from("loan_applications")
    .select("id, member_id, loan_product_id, amount_requested, tenure_months, status")
    .eq("id", parsedParams.data.applicationId)
    .maybeSingle();

  if (applicationError || !application) {
    return jsonError("The selected application could not be found.", 404);
  }

  const selectedApplication = application as LoanApplicationRecord;

  if (selectedApplication.status === "rejected") {
    return jsonError(
      "Rejected applications cannot be approved until they are resubmitted.",
      400,
    );
  }

  if (selectedApplication.status === "disbursed") {
    return jsonError("This application has already been disbursed.", 400);
  }

  const [{ data: product, error: productError }, { data: existingLoan, error: existingLoanError }] =
    await Promise.all([
      admin
        .from("loan_products")
        .select("name, interest_rate, interest_type")
        .eq("id", selectedApplication.loan_product_id)
        .maybeSingle(),
      admin
        .from("loans")
        .select("id, amount_disbursed")
        .eq("application_id", selectedApplication.id)
        .maybeSingle(),
    ]);

  if (productError || !product) {
    return jsonError("The loan product attached to this application was not found.", 404);
  }

  if (existingLoanError) {
    return jsonError("Unable to verify the generated loan record.", 500);
  }

  const productRecord = product as LoanProductRecord;
  const currentLoan = (existingLoan as LoanRecord | null) ?? null;

  if (currentLoan && parseMoney(currentLoan.amount_disbursed) > 0) {
    return jsonError(
      "This loan has already recorded a disbursement and cannot be re-approved.",
      409,
    );
  }

  const loanMutationPayload = {
    application_id: selectedApplication.id,
    member_id: selectedApplication.member_id,
    principal_amount: parseMoney(selectedApplication.amount_requested),
    interest_rate: parseMoney(productRecord.interest_rate),
    tenure_months: selectedApplication.tenure_months,
    status: "active" as const,
  };

  const loanMutation = currentLoan
    ? admin
        .from("loans")
        .update(loanMutationPayload)
        .eq("id", currentLoan.id)
        .select("id")
        .single()
    : admin
        .from("loans")
        .insert(loanMutationPayload)
        .select("id")
        .single();

  const { data: loanRecord, error: loanMutationError } = await loanMutation;

  if (loanMutationError || !loanRecord) {
    return jsonError(
      loanMutationError?.message ?? "Unable to create the loan approval record.",
      500,
    );
  }

  const loanId = loanRecord.id;
  const scheduleResult = await admin.functions.invoke("generate-repayment-schedule", {
    body: {
      loanId,
    },
  });

  const scheduleData = scheduleResult.data as
    | {
        error?: string;
        monthlyRepayment?: number;
      }
    | null;

  if (scheduleResult.error || scheduleData?.error) {
    return jsonError(
      scheduleData?.error ??
        scheduleResult.error?.message ??
        "Unable to generate the repayment schedule for this approval.",
      500,
    );
  }

  const now = new Date().toISOString();
  const { error: updateApplicationError } = await admin
    .from("loan_applications")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: now,
      approved_by: user.id,
      approved_at: now,
      rejection_reason: null,
    })
    .eq("id", parsedParams.data.applicationId);

  if (updateApplicationError) {
    return jsonError(
      updateApplicationError.message ??
        "The application was approved, but the status could not be updated cleanly.",
      500,
    );
  }

  revalidatePath("/admin/loans");
  revalidatePath("/portal/loans");

  const notificationResult = await sendMemberNotification(admin, {
    actionUrl: "/portal/loans",
    contextLabel: "Loan approval notification",
    emailSubject:
      "Loan approval update - Ifemelunma Multi-Purpose Co-operative Society",
    memberId: selectedApplication.member_id,
    message: `Your ${productRecord.name} application for ${formatNaira(
      parseMoney(selectedApplication.amount_requested),
    )} has been approved. Your projected monthly repayment is ${formatNaira(
      scheduleData?.monthlyRepayment ?? 0,
    )}, and the repayment schedule is now available in your member portal.`,
    title: "Loan application approved",
    type: "loan_approved",
  });

  return NextResponse.json({
    message: `The loan was approved and a repayment schedule has been generated.${
      notificationResult.warnings.length > 0
        ? " The approval saved successfully, but member notification delivery needs review."
        : ""
    }`,
    loanId,
    monthlyRepayment: scheduleData?.monthlyRepayment ?? null,
    warnings: notificationResult.warnings,
  });
}
