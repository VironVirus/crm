import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { sendMemberNotification } from "@/lib/notification-dispatch";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { applicationIdParamsSchema } from "@/lib/validation/api";
import { loanRejectionSchema } from "@/lib/validation/loans";

export const runtime = "nodejs";

type LoanApplicationRecord = {
  member_id: string;
  loan_product:
    | {
        name: string;
      }
    | Array<{
        name: string;
      }>
    | null;
  status:
    | "submitted"
    | "under_review"
    | "approved"
    | "rejected"
    | "disbursed";
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
    return jsonError("Unable to read the rejection details.", 400);
  }

  const parsed = loanRejectionSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the rejection reason and try again.",
      400,
    );
  }

  const sessionClient = createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before rejecting loan applications.", 401);
  }

  const { data: adminProfile } = await sessionClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (adminProfile?.role !== "admin") {
    return jsonError("Administrative access is required for this action.", 403);
  }

  const admin = createSupabaseAdminClient();
  const { data: application, error: applicationError } = await admin
    .from("loan_applications")
    .select("member_id, status, loan_product:loan_products(name)")
    .eq("id", parsedParams.data.applicationId)
    .maybeSingle();

  if (applicationError || !application) {
    return jsonError("The selected application could not be found.", 404);
  }

  const selectedApplication = application as LoanApplicationRecord;
  const loanProduct = Array.isArray(selectedApplication.loan_product)
    ? (selectedApplication.loan_product[0] ?? null)
    : selectedApplication.loan_product;

  if (
    selectedApplication.status === "approved" ||
    selectedApplication.status === "disbursed"
  ) {
    return jsonError(
      "Approved or disbursed applications cannot be rejected from this workflow.",
      400,
    );
  }

  const { error: updateError } = await admin
    .from("loan_applications")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: parsed.data.rejectionReason,
    })
    .eq("id", parsedParams.data.applicationId);

  if (updateError) {
    return jsonError(
      updateError.message ?? "Unable to reject the loan application.",
      500,
    );
  }

  revalidatePath("/admin/loans");
  revalidatePath("/portal/loans");

  const notificationResult = await sendMemberNotification(admin, {
    actionUrl: "/portal/loans",
    contextLabel: "Loan rejection notification",
    emailSubject: "Loan application update - Ifemelunma Cooperative Society",
    memberId: selectedApplication.member_id,
    message: `Your ${loanProduct?.name ?? "loan"} application was not approved. Reason: ${parsed.data.rejectionReason}. You can review the update in your member portal and submit a fresh application when ready.`,
    title: "Loan application not approved",
    type: "loan_rejected",
  });

  return NextResponse.json({
    message: `The application has been rejected and the reason has been saved.${
      notificationResult.warnings.length > 0
        ? " The rejection was saved, but member notification delivery needs review."
        : ""
    }`,
    warnings: notificationResult.warnings,
  });
}
