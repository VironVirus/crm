import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  calculateLoanEstimate,
  calculateMaximumEligibleLoan,
  formatNaira,
  getEffectiveLoanProductMaximum,
  parseMoney,
  roundCurrency,
  type LoanInterestType,
  type LoanProductOption,
} from "@/lib/loans";
import { getMemberTier } from "@/lib/member-tier";
import { sendMemberNotification } from "@/lib/notification-dispatch";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loanApplicationSchema } from "@/lib/validation/loans";

export const runtime = "nodejs";

type LoanProductRecord = {
  description: string | null;
  id: string;
  name: string;
  interest_rate: number | string | null;
  interest_type: LoanInterestType;
  maximum_disbursable_amount: number | string | null;
  min_amount: number | string | null;
  max_amount: number | string | null;
  min_tenure_months: number;
  max_tenure_months: number;
  max_loan_to_savings_ratio: number | string | null;
  penalty_rate: number | string | null;
  processing_fee_rate: number | string | null;
  terms_summary: string | null;
  is_active: boolean;
};

type SavingsAccountRecord = {
  balance: number | string | null;
};

type ProfileRecord = {
  full_name: string;
  id: string;
  status: "active" | "inactive" | "suspended";
};

type MemberRecord = {
  id: string;
  national_id_path: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  onboarding_status: "pending" | "registered";
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

type LoanGuarantorRecord = {
  loan_application_id: string;
};

type LoanRecord = {
  application_id: string;
};

type GuarantorInviteFunctionResult = {
  error?: string;
  warnings?: string[];
};

type GuarantorInviteFallbackResult =
  | {
      ok: true;
      warnings: string[];
    }
  | {
      ok: false;
      message: string;
      status: number;
    };

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function splitLiabilityAmount(totalAmount: number, count: number) {
  if (count <= 0) {
    return [];
  }

  const baseShare = roundCurrency(totalAmount / count);
  let allocated = 0;

  return Array.from({ length: count }, (_, index) => {
    if (index === count - 1) {
      return roundCurrency(totalAmount - allocated);
    }

    allocated += baseShare;
    return baseShare;
  });
}

async function createGuarantorInviteFallback(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  {
    applicantName,
    applicationMemberId,
    guarantorMemberId,
    liabilityAmount,
    loanAmount,
    loanApplicationId,
    loanProductName,
    tenureMonths,
  }: {
    applicantName: string;
    applicationMemberId: string;
    guarantorMemberId: string;
    liabilityAmount: number;
    loanAmount: number;
    loanApplicationId: string;
    loanProductName: string;
    tenureMonths: number;
  },
): Promise<GuarantorInviteFallbackResult> {
  if (applicationMemberId === guarantorMemberId) {
    return {
      ok: false,
      message: "A member cannot act as guarantor on their own application.",
      status: 400,
    };
  }

  const [
    { data: guarantorProfile, error: guarantorProfileError },
    { data: guarantorMember, error: guarantorMemberError },
    { data: duplicateInvite, error: duplicateInviteError },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, status")
      .eq("id", guarantorMemberId)
      .maybeSingle(),
    admin
      .from("members")
      .select(
        "id, onboarding_status, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
      )
      .eq("id", guarantorMemberId)
      .maybeSingle(),
    admin
      .from("loan_guarantors")
      .select("loan_application_id")
      .eq("loan_application_id", loanApplicationId)
      .eq("guarantor_member_id", guarantorMemberId)
      .maybeSingle(),
  ]);

  if (guarantorProfileError || !guarantorProfile) {
    return {
      ok: false,
      message: "Guarantor profile could not be found.",
      status: 404,
    };
  }

  if (guarantorMemberError || !guarantorMember) {
    return {
      ok: false,
      message: "Guarantor member record could not be found.",
      status: 404,
    };
  }

  if (duplicateInviteError) {
    return {
      ok: false,
      message: "Unable to verify duplicate guarantor requests.",
      status: 500,
    };
  }

  if (duplicateInvite) {
    return {
      ok: false,
      message: "This member has already been added as guarantor on the application.",
      status: 409,
    };
  }

  const guarantorProfileRecord = guarantorProfile as ProfileRecord;
  const guarantorMemberRecord = guarantorMember as MemberRecord;

  if (guarantorProfileRecord.status !== "active") {
    return {
      ok: false,
      message: "Only active members in good standing can act as guarantors.",
      status: 400,
    };
  }

  if (guarantorMemberRecord.onboarding_status !== "registered") {
    return {
      ok: false,
      message: "Only fully registered members can act as guarantors.",
      status: 400,
    };
  }

  if (getMemberTier(guarantorMemberRecord) !== "tier_3") {
    return {
      ok: false,
      message: "Only Tier 3 members can act as guarantors for loans.",
      status: 400,
    };
  }

  const { data: acceptedGuarantees, error: acceptedGuaranteesError } = await admin
    .from("loan_guarantors")
    .select("loan_application_id")
    .eq("guarantor_member_id", guarantorMemberId)
    .eq("status", "accepted")
    .is("released_at", null);

  if (acceptedGuaranteesError) {
    return {
      ok: false,
      message: "Unable to verify the guarantor's active obligations.",
      status: 500,
    };
  }

  const guaranteedApplicationIds = (
    (acceptedGuarantees as LoanGuarantorRecord[] | null) ?? []
  ).map((record) => record.loan_application_id);

  let activeGuaranteedLoansCount = 0;

  if (guaranteedApplicationIds.length > 0) {
    const { data: activeLoans, error: activeLoansError } = await admin
      .from("loans")
      .select("application_id")
      .in("application_id", guaranteedApplicationIds)
      .in("status", ["active", "defaulted"]);

    if (activeLoansError) {
      return {
        ok: false,
        message: "Unable to count the guarantor's active guaranteed loans.",
        status: 500,
      };
    }

    activeGuaranteedLoansCount = ((activeLoans as LoanRecord[] | null) ?? []).length;
  }

  if (activeGuaranteedLoansCount >= 2) {
    return {
      ok: false,
      message:
        "This member is already guaranteeing 2 active loans and cannot accept another one right now.",
      status: 400,
    };
  }

  const { error: invitationError } = await admin.from("loan_guarantors").insert({
    loan_application_id: loanApplicationId,
    guarantor_member_id: guarantorMemberId,
    liability_amount: liabilityAmount,
    status: "invited",
  });

  if (invitationError) {
    return {
      ok: false,
      message:
        invitationError.message ??
        "Unable to create the guarantor invitation record.",
      status: 500,
    };
  }

  const notificationResult = await sendMemberNotification(admin, {
    actionUrl: "/portal",
    contextLabel: "Guarantor invitation fallback notification",
    emailSubject:
      "Guarantor request from Ifemelunma Multi-Purpose Co-operative Society",
    memberId: guarantorMemberId,
    message: `${applicantName} listed you as a guarantor for ${loanProductName}. Loan amount: ${formatNaira(
      loanAmount,
    )}. Tenure: ${tenureMonths} months. Liability share: ${formatNaira(
      liabilityAmount,
    )}. Sign in to review and respond from your member portal.`,
    title: "New guarantor request",
    type: "guarantor_invite",
  });

  return {
    ok: true,
    warnings: notificationResult.warnings,
  };
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the loan request details.", 400);
  }

  const parsed = loanApplicationSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the loan application details and try again.",
      400,
    );
  }

  const sessionClient = createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before applying for a loan.", 401);
  }

  const admin = createSupabaseAdminClient();

  const [
    { data: memberRecord, error: memberError },
    { data: product, error: productError },
    { data: applicantProfile, error: applicantProfileError },
  ] =
    await Promise.all([
      admin
        .from("members")
        .select(
          "id, onboarding_status, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
        )
        .eq("id", user.id)
        .maybeSingle(),
      admin
        .from("loan_products")
        .select(
          "id, name, description, interest_rate, interest_type, min_amount, max_amount, min_tenure_months, max_tenure_months, max_loan_to_savings_ratio, maximum_disbursable_amount, processing_fee_rate, penalty_rate, terms_summary, is_active",
        )
        .eq("id", parsed.data.loanProductId)
        .maybeSingle(),
      admin.from("profiles").select("id, full_name, status").eq("id", user.id).maybeSingle(),
    ]);

  if (memberError || !memberRecord) {
    return jsonError(
      "Your member registration record could not be verified yet.",
      403,
    );
  }

  const applicantMemberRecord = memberRecord as MemberRecord;

  if (getMemberTier(applicantMemberRecord) !== "tier_3") {
    return jsonError(
      "Complete your profile to Tier 3 before applying for a loan.",
      403,
    );
  }

  if (productError || !product) {
    return jsonError("The selected loan product could not be found.", 404);
  }

  if (applicantProfileError || !applicantProfile) {
    return jsonError("Your profile could not be verified for this application.", 404);
  }

  const selectedProduct = product as LoanProductRecord;
  const applicantProfileRecord = applicantProfile as ProfileRecord;

  if (!selectedProduct.is_active) {
    return jsonError(
      "That loan product is not accepting new applications right now.",
      400,
    );
  }

  const minAmount = parseMoney(selectedProduct.min_amount);
  const maxAmount = getEffectiveLoanProductMaximum({
    description: selectedProduct.description,
    id: selectedProduct.id,
    interestRate: parseMoney(selectedProduct.interest_rate),
    interestType: selectedProduct.interest_type,
    isActive: selectedProduct.is_active,
    maxAmount: parseMoney(selectedProduct.max_amount),
    maxLoanToSavingsRatio: parseMoney(selectedProduct.max_loan_to_savings_ratio),
    maxTenureMonths: selectedProduct.max_tenure_months,
    maximumDisbursableAmount: selectedProduct.maximum_disbursable_amount
      ? parseMoney(selectedProduct.maximum_disbursable_amount)
      : null,
    minAmount,
    minTenureMonths: selectedProduct.min_tenure_months,
    name: selectedProduct.name,
    penaltyRate: parseMoney(selectedProduct.penalty_rate),
    processingFeeRate: parseMoney(selectedProduct.processing_fee_rate),
    termsSummary: selectedProduct.terms_summary,
  } satisfies LoanProductOption);
  const maxLoanToSavingsRatio = parseMoney(
    selectedProduct.max_loan_to_savings_ratio,
  );

  if (parsed.data.amountRequested < minAmount) {
    return jsonError(
      `Minimum amount for ${selectedProduct.name} is ${formatNaira(minAmount)}.`,
      400,
    );
  }

  if (parsed.data.amountRequested > maxAmount) {
    return jsonError(
      `Maximum amount for ${selectedProduct.name} is ${formatNaira(maxAmount)}.`,
      400,
    );
  }

  if (parsed.data.tenureMonths < selectedProduct.min_tenure_months) {
    return jsonError(
      `Tenure for ${selectedProduct.name} must be at least ${selectedProduct.min_tenure_months} months.`,
      400,
    );
  }

  if (parsed.data.tenureMonths > selectedProduct.max_tenure_months) {
    return jsonError(
      `Tenure for ${selectedProduct.name} cannot exceed ${selectedProduct.max_tenure_months} months.`,
      400,
    );
  }

  const { data: savingsAccounts, error: savingsError } = await admin
    .from("savings_accounts")
    .select("balance")
    .eq("member_id", user.id)
    .eq("status", "active");

  if (savingsError) {
    return jsonError(
      "Your savings balance could not be verified right now.",
      500,
    );
  }

  const savingsBalance = ((savingsAccounts as SavingsAccountRecord[] | null) ?? []).reduce(
    (total, account) => total + parseMoney(account.balance),
    0,
  );
  const maxEligibleLoan = calculateMaximumEligibleLoan(
    savingsBalance,
    maxLoanToSavingsRatio,
  );

  if (parsed.data.amountRequested > maxEligibleLoan) {
    return jsonError(
      `Based on your current savings, your maximum eligible amount is ${formatNaira(
        maxEligibleLoan,
      )}.`,
      400,
    );
  }

  const { data: applicationRecord, error: applicationError } = await admin
    .from("loan_applications")
    .insert({
      member_id: user.id,
      loan_product_id: parsed.data.loanProductId,
      amount_requested: parsed.data.amountRequested,
      tenure_months: parsed.data.tenureMonths,
      purpose: parsed.data.purpose,
      status: "submitted",
    })
    .select("id")
    .single();

  if (applicationError || !applicationRecord) {
    return jsonError(
      applicationError?.message ??
        "Unable to submit the loan application right now.",
      500,
    );
  }

  const guarantorMemberIds = parsed.data.guarantorMemberIds ?? [];
  const liabilityShares = splitLiabilityAmount(
    parsed.data.amountRequested,
    guarantorMemberIds.length,
  );
  const guarantorWarnings = new Set<string>();

  for (const [index, guarantorMemberId] of guarantorMemberIds.entries()) {
    const liabilityAmount = liabilityShares[index] ?? 0;
    const invitePayload = {
      loanApplicationId: applicationRecord.id,
      guarantorMemberId,
      liabilityAmount,
    };

    const inviteResult = await admin.functions.invoke("invite-guarantor", {
      body: invitePayload,
    });
    const inviteData = (inviteResult.data as GuarantorInviteFunctionResult | null) ?? null;

    if (!inviteResult.error && !inviteData?.error) {
      (inviteData?.warnings ?? []).forEach((warning) => guarantorWarnings.add(warning));
      continue;
    }

    const fallback = await createGuarantorInviteFallback(admin, {
      applicantName: applicantProfileRecord.full_name,
      applicationMemberId: user.id,
      guarantorMemberId,
      liabilityAmount,
      loanAmount: parsed.data.amountRequested,
      loanApplicationId: applicationRecord.id,
      loanProductName: selectedProduct.name,
      tenureMonths: parsed.data.tenureMonths,
    });

    if (!fallback.ok) {
      await admin
        .from("loan_applications")
        .delete()
        .eq("id", applicationRecord.id);

      return jsonError(fallback.message, fallback.status);
    }

    fallback.warnings.forEach((warning) => guarantorWarnings.add(warning));
  }

  const estimate = calculateLoanEstimate({
    annualInterestRate: parseMoney(selectedProduct.interest_rate),
    interestType: selectedProduct.interest_type,
    principal: parsed.data.amountRequested,
    tenureMonths: parsed.data.tenureMonths,
  });

  revalidatePath("/portal");
  revalidatePath("/portal/loans");
  revalidatePath("/admin/loans");

  return NextResponse.json(
    {
      applicationId: applicationRecord.id,
      message: `Your application for ${selectedProduct.name} has been submitted. Estimated monthly repayment: ${formatNaira(
        estimate.monthlyRepayment,
      )}.`,
      warnings: Array.from(guarantorWarnings),
    },
    { status: 201 },
  );
}
