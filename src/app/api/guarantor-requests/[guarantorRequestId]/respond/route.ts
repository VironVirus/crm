import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getMemberTier } from "@/lib/member-tier";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { guarantorRequestIdParamsSchema } from "@/lib/validation/api";
import { guarantorResponseSchema } from "@/lib/validation/loans";

export const runtime = "nodejs";

type LoanGuarantorRecord = {
  id: string;
  loan_application_id: string;
  guarantor_member_id: string;
  status: "invited" | "accepted" | "declined";
};

type LoanApplicationRecord = {
  status:
    | "draft"
    | "submitted"
    | "under_review"
    | "approved"
    | "rejected"
    | "disbursed"
    | "closed";
};

type ProfileRecord = {
  status: "active" | "inactive" | "suspended";
};

type MemberRecord = {
  national_id_path: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  onboarding_status: "pending" | "registered";
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

type LoanGuarantorAcceptedRecord = {
  loan_application_id: string;
};

type LoanRecord = {
  application_id: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(
  request: NextRequest,
  context: { params: { guarantorRequestId: string } },
) {
  const parsedParams = guarantorRequestIdParamsSchema.safeParse(context.params);

  if (!parsedParams.success) {
    return jsonError("Invalid guarantor request reference.", 400);
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the guarantor response.", 400);
  }

  const parsed = guarantorResponseSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the guarantor response and try again.",
      400,
    );
  }

  const sessionClient = createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before responding to a guarantor request.", 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: guarantorRequest, error: guarantorRequestError } = await admin
    .from("loan_guarantors")
    .select("id, loan_application_id, guarantor_member_id, status")
    .eq("id", parsedParams.data.guarantorRequestId)
    .maybeSingle();

  if (guarantorRequestError || !guarantorRequest) {
    return jsonError("The selected guarantor request could not be found.", 404);
  }

  const requestRecord = guarantorRequest as LoanGuarantorRecord;

  if (requestRecord.guarantor_member_id !== user.id) {
    return jsonError("This guarantor request does not belong to your account.", 403);
  }

  if (requestRecord.status !== "invited") {
    return jsonError("This guarantor request has already been responded to.", 400);
  }

  if (parsed.data.decision === "accepted") {
    const [
      { data: profile, error: profileError },
      { data: member, error: memberError },
      { data: application, error: applicationError },
    ] = await Promise.all([
      admin.from("profiles").select("status").eq("id", user.id).maybeSingle(),
      admin
        .from("members")
        .select(
          "onboarding_status, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
        )
        .eq("id", user.id)
        .maybeSingle(),
      admin
        .from("loan_applications")
        .select("status")
        .eq("id", requestRecord.loan_application_id)
        .maybeSingle(),
    ]);

    if (profileError || !profile) {
      return jsonError("Your member profile could not be verified right now.", 500);
    }

    if (memberError || !member) {
      return jsonError("Your member registration record could not be verified right now.", 500);
    }

    if (applicationError || !application) {
      return jsonError("The linked loan application could not be found.", 404);
    }

    const profileRecord = profile as ProfileRecord;
    const memberRecord = member as MemberRecord;
    const applicationRecord = application as LoanApplicationRecord;

    if (profileRecord.status !== "active") {
      return jsonError(
        "Only active members in good standing can accept guarantor requests.",
        400,
      );
    }

    if (memberRecord.onboarding_status !== "registered") {
      return jsonError(
        "Only fully registered members can accept guarantor requests.",
        400,
      );
    }

    if (getMemberTier(memberRecord) !== "tier_3") {
      return jsonError(
        "Complete your profile to Tier 3 before accepting guarantor requests.",
        403,
      );
    }

    if (
      applicationRecord.status === "rejected" ||
      applicationRecord.status === "disbursed" ||
      applicationRecord.status === "closed"
    ) {
      return jsonError(
        "This loan request is no longer open for new guarantor acceptances.",
        400,
      );
    }

    const { data: acceptedGuarantees, error: acceptedGuaranteesError } = await admin
      .from("loan_guarantors")
      .select("loan_application_id")
      .eq("guarantor_member_id", user.id)
      .eq("status", "accepted")
      .is("released_at", null);

    if (acceptedGuaranteesError) {
      return jsonError(
        "Unable to verify your active guarantor obligations right now.",
        500,
      );
    }

    const guaranteedApplicationIds = (
      (acceptedGuarantees as LoanGuarantorAcceptedRecord[] | null) ?? []
    ).map((record) => record.loan_application_id);

    if (guaranteedApplicationIds.length > 0) {
      const { data: activeLoans, error: activeLoansError } = await admin
        .from("loans")
        .select("application_id")
        .in("application_id", guaranteedApplicationIds)
        .in("status", ["active", "defaulted"]);

      if (activeLoansError) {
        return jsonError(
          "Unable to count your active guaranteed loans right now.",
          500,
        );
      }

      if (((activeLoans as LoanRecord[] | null) ?? []).length >= 2) {
        return jsonError(
          "You are already guaranteeing 2 active loans and cannot accept another one right now.",
          400,
        );
      }
    }
  }

  const { error: updateError } = await admin
    .from("loan_guarantors")
    .update({
      status: parsed.data.decision,
      responded_at: new Date().toISOString(),
    })
    .eq("id", parsedParams.data.guarantorRequestId);

  if (updateError) {
    return jsonError(
      updateError.message ?? "Unable to save the guarantor response right now.",
      500,
    );
  }

  revalidatePath("/portal");
  revalidatePath("/portal/loans");
  revalidatePath("/admin/loans");

  return NextResponse.json({
    message:
      parsed.data.decision === "accepted"
        ? "You have accepted this guarantor request."
        : "You have declined this guarantor request.",
  });
}
