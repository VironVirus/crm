import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { applicationIdParamsSchema } from "@/lib/validation/api";
import { loanStatusUpdateSchema } from "@/lib/validation/loans";

export const runtime = "nodejs";

type LoanApplicationRecord = {
  id: string;
  status: "submitted" | "under_review" | "approved" | "rejected" | "disbursed";
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> },
) {
  const parsedParams = applicationIdParamsSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return jsonError("Invalid loan application reference.", 400);
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the status update.", 400);
  }

  const parsed = loanStatusUpdateSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the status update details and try again.",
      400,
    );
  }

  const sessionClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before updating loan applications.", 401);
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
    .select("id, status")
    .eq("id", parsedParams.data.applicationId)
    .maybeSingle();

  if (applicationError || !application) {
    return jsonError("The selected application could not be found.", 404);
  }

  const currentApplication = application as LoanApplicationRecord;

  if (
    currentApplication.status === "approved" ||
    currentApplication.status === "rejected" ||
    currentApplication.status === "disbursed"
  ) {
    return jsonError(
      "Use the dedicated approve, reject, or disburse action for this application.",
      400,
    );
  }

  const updatePayload =
    parsed.data.status === "under_review"
      ? {
          status: "under_review",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: null,
        }
      : {
          status: "submitted",
          reviewed_by: null,
          reviewed_at: null,
          rejection_reason: null,
        };

  const { error: updateError } = await admin
    .from("loan_applications")
    .update(updatePayload)
    .eq("id", parsedParams.data.applicationId);

  if (updateError) {
    return jsonError(
      updateError.message ?? "Unable to update the loan application status.",
      500,
    );
  }

  revalidatePath("/admin/loans");
  revalidatePath("/portal/loans");

  return NextResponse.json({
    message:
      parsed.data.status === "under_review"
        ? "The application has moved into review."
        : "The application has been returned to the submitted queue.",
  });
}
