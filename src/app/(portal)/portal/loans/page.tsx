import { redirect } from "next/navigation";
import MemberLoansPageView from "@/features/portal/loans/page-view";
import {
  calculateLoanEstimate,
  parseMoney,
  type GuarantorMemberOption,
  type LoanApplicationStatus,
  type LoanGuarantorStatus,
  type LoanInterestType,
  type LoanProductOption,
  type MemberLoanApplicationRow,
} from "@/lib/loans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ProfileRecord = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  member_number: string | null;
  status: "active" | "inactive" | "suspended";
};

type MemberRecord = {
  id: string;
};

type LoanProductRecord = {
  id: string;
  name: string;
  interest_rate: number | string | null;
  interest_type: LoanInterestType;
  min_amount: number | string | null;
  max_amount: number | string | null;
  min_tenure_months: number;
  max_tenure_months: number;
  max_loan_to_savings_ratio: number | string | null;
  is_active: boolean;
};

type LoanApplicationRecord = {
  id: string;
  loan_product_id: string;
  amount_requested: number | string | null;
  tenure_months: number;
  purpose: string;
  status: LoanApplicationStatus;
  applied_at: string;
  rejection_reason: string | null;
  loan_product:
    | {
        name: string;
        interest_rate: number | string | null;
        interest_type: LoanInterestType;
      }
    | Array<{
        name: string;
        interest_rate: number | string | null;
        interest_type: LoanInterestType;
      }>
    | null;
};

type LoanGuarantorRecord = {
  id: string;
  loan_application_id: string;
  guarantor_member_id: string;
  status: LoanGuarantorStatus;
  invited_at: string;
  responded_at: string | null;
  liability_amount: number | string | null;
  released_at: string | null;
};

type SavingsAccountRecord = {
  balance: number | string | null;
};

function getLoanProductRelation(
  relation: LoanApplicationRecord["loan_product"],
) {
  if (!relation) {
    return null;
  }

  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

export default async function PortalLoansPage() {
  const sessionClient = createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    redirect("/login?next=/portal/loans");
  }

  const admin = createSupabaseAdminClient();

  const [
    profileResult,
    productsResult,
    applicationsResult,
    savingsResult,
    registeredMembersResult,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, email, phone, member_number, status")
      .eq("id", user.id)
      .maybeSingle(),
    admin
      .from("loan_products")
      .select(
        "id, name, interest_rate, interest_type, min_amount, max_amount, min_tenure_months, max_tenure_months, max_loan_to_savings_ratio, is_active",
      )
      .eq("is_active", true)
      .order("name"),
    admin
      .from("loan_applications")
      .select(
        "id, loan_product_id, amount_requested, tenure_months, purpose, status, applied_at, rejection_reason, loan_product:loan_products(name, interest_rate, interest_type)",
      )
      .eq("member_id", user.id)
      .order("applied_at", { ascending: false }),
    admin
      .from("savings_accounts")
      .select("balance")
      .eq("member_id", user.id)
      .eq("status", "active"),
    admin
      .from("members")
      .select("id")
      .eq("onboarding_status", "registered"),
  ]);

  const rawApplications =
    (applicationsResult.data as LoanApplicationRecord[] | null) ?? [];
  const applicationIds = rawApplications.map((application) => application.id);

  const guarantorsResult =
    applicationIds.length > 0
      ? await admin
          .from("loan_guarantors")
          .select(
            "id, loan_application_id, guarantor_member_id, status, invited_at, responded_at, liability_amount, released_at",
          )
          .in("loan_application_id", applicationIds)
          .order("invited_at", { ascending: true })
      : { data: [] as LoanGuarantorRecord[], error: null };

  const guarantorProfileIds = Array.from(
    new Set(
      ((guarantorsResult.data as LoanGuarantorRecord[] | null) ?? []).map(
        (record) => record.guarantor_member_id,
      ),
    ),
  );

  const guarantorProfilesResult =
    guarantorProfileIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, full_name, email, phone, member_number, status")
          .in("id", guarantorProfileIds)
      : { data: [] as ProfileRecord[], error: null };

  const eligibleMemberIds = ((registeredMembersResult.data as MemberRecord[] | null) ?? [])
    .map((member) => member.id)
    .filter((memberId) => memberId !== user.id);

  const guarantorCandidatesResult =
    eligibleMemberIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, full_name, email, phone, member_number, status")
          .in("id", eligibleMemberIds)
          .eq("status", "active")
          .order("full_name")
      : { data: [] as ProfileRecord[], error: null };

  const loanProducts = ((productsResult.data as LoanProductRecord[] | null) ?? []).map(
    (product) =>
      ({
        id: product.id,
        name: product.name,
        interestRate: parseMoney(product.interest_rate),
        interestType: product.interest_type,
        minAmount: parseMoney(product.min_amount),
        maxAmount: parseMoney(product.max_amount),
        minTenureMonths: product.min_tenure_months,
        maxTenureMonths: product.max_tenure_months,
        maxLoanToSavingsRatio: parseMoney(product.max_loan_to_savings_ratio),
        isActive: product.is_active,
      }) satisfies LoanProductOption,
  );

  const guarantorProfileMap = new Map(
    (((guarantorProfilesResult.data as ProfileRecord[] | null) ?? []).map((profile) => [
      profile.id,
      profile,
    ])) satisfies Array<[string, ProfileRecord]>,
  );
  const guarantorsByApplication = new Map<
    string,
    MemberLoanApplicationRow["guarantors"]
  >();

  ((guarantorsResult.data as LoanGuarantorRecord[] | null) ?? []).forEach((record) => {
    const profile = guarantorProfileMap.get(record.guarantor_member_id);

    if (!profile) {
      return;
    }

    const guarantors = guarantorsByApplication.get(record.loan_application_id) ?? [];

    guarantors.push({
      id: record.id,
      guarantorMemberId: record.guarantor_member_id,
      fullName: profile.full_name,
      memberNumber: profile.member_number,
      email: profile.email,
      phone: profile.phone,
      status: record.status,
      invitedAt: record.invited_at,
      respondedAt: record.responded_at,
      liabilityAmount: parseMoney(record.liability_amount),
      releasedAt: record.released_at,
    });

    guarantorsByApplication.set(record.loan_application_id, guarantors);
  });

  const applications = rawApplications
    .map((application) => {
      const product = getLoanProductRelation(application.loan_product);
      const amountRequested = parseMoney(application.amount_requested);
      const interestRate = parseMoney(product?.interest_rate);
      const estimate = calculateLoanEstimate({
        annualInterestRate: interestRate,
        interestType: product?.interest_type ?? "flat",
        principal: amountRequested,
        tenureMonths: application.tenure_months,
      });

      return {
        id: application.id,
        loanProductId: application.loan_product_id,
        productName: product?.name ?? "Loan product",
        interestRate,
        interestType: product?.interest_type ?? "flat",
        amountRequested,
        tenureMonths: application.tenure_months,
        purpose: application.purpose,
        status: application.status,
        appliedAt: application.applied_at,
        rejectionReason: application.rejection_reason,
        monthlyRepaymentEstimate: estimate.monthlyRepayment,
        totalRepayableEstimate: estimate.totalRepayable,
        guarantors: guarantorsByApplication.get(application.id) ?? [],
      } satisfies MemberLoanApplicationRow;
    })
    .filter((application) => application.status !== "draft");

  const guarantorCandidates = (
    (guarantorCandidatesResult.data as ProfileRecord[] | null) ?? []
  ).map(
    (profile) =>
      ({
        id: profile.id,
        fullName: profile.full_name,
        memberNumber: profile.member_number,
        email: profile.email,
        phone: profile.phone,
      }) satisfies GuarantorMemberOption,
  );

  const savingsBalance = (
    (savingsResult.data as SavingsAccountRecord[] | null) ?? []
  ).reduce((total, account) => total + parseMoney(account.balance), 0);

  const errors = [
    profileResult.error?.message,
    productsResult.error?.message,
    applicationsResult.error?.message,
    savingsResult.error?.message,
    registeredMembersResult.error?.message,
    guarantorsResult.error?.message,
    guarantorProfilesResult.error?.message,
    guarantorCandidatesResult.error?.message,
  ].filter(Boolean);

  const profile = (profileResult.data as ProfileRecord | null) ?? null;

  return (
    <MemberLoansPageView
      applications={applications}
      dataError={errors.length > 0 ? errors.join(" ") : null}
      guarantorCandidates={guarantorCandidates}
      loanProducts={loanProducts}
      memberName={profile?.full_name ?? user.email ?? "Member"}
      memberNumber={profile?.member_number ?? null}
      savingsBalance={savingsBalance}
    />
  );
}
