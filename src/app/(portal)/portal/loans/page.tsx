"use client";

import type { ComponentProps } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import MemberLoansPageView from "@/features/portal/loans/page-view";
import {
  StaticPageError,
  StaticPageLoading,
  useStaticPageData,
} from "@/components/static/static-page-state";
import { getMemberTier } from "@/lib/member-tier";
import { staticApiFetch } from "@/lib/static-api";
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
  national_id_path: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  onboarding_status: "pending" | "registered";
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

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

async function loadPortalLoansPage(
  supabase: SupabaseClient,
  user: User,
): Promise<ComponentProps<typeof MemberLoansPageView>> {
  const [
    profileResult,
    memberResult,
    productsResult,
    applicationsResult,
    savingsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, member_number, status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("members")
      .select(
        "id, onboarding_status, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("loan_products")
      .select(
        "id, name, description, interest_rate, interest_type, min_amount, max_amount, min_tenure_months, max_tenure_months, max_loan_to_savings_ratio, maximum_disbursable_amount, processing_fee_rate, penalty_rate, terms_summary, is_active",
      )
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("loan_applications")
      .select(
        "id, loan_product_id, amount_requested, tenure_months, purpose, status, applied_at, rejection_reason, loan_product:loan_products(name, interest_rate, interest_type)",
      )
      .eq("member_id", user.id)
      .order("applied_at", { ascending: false }),
    supabase
      .from("savings_accounts")
      .select("balance")
      .eq("member_id", user.id)
      .eq("status", "active"),
  ]);

  const currentMember = memberResult.data as MemberRecord | null;
  const memberTier = getMemberTier(currentMember);

  const rawApplications =
    (applicationsResult.data as LoanApplicationRecord[] | null) ?? [];
  const applicationIds = rawApplications.map((application) => application.id);

  const guarantorsResult =
    applicationIds.length > 0
      ? await supabase
          .from("loan_guarantors")
          .select(
            "id, loan_application_id, guarantor_member_id, status, invited_at, responded_at, liability_amount, released_at",
          )
          .in("loan_application_id", applicationIds)
          .order("invited_at", { ascending: true })
      : { data: [] as LoanGuarantorRecord[], error: null };

  const supportResponse = await staticApiFetch("/api/portal/loan-support");
  const supportPayload = (await supportResponse.json().catch(() => null)) as
    | { candidates?: ProfileRecord[]; message?: string; profiles?: ProfileRecord[] }
    | null;
  const guarantorProfiles = supportResponse.ok ? supportPayload?.profiles ?? [] : [];
  const guarantorCandidateProfiles = supportResponse.ok
    ? supportPayload?.candidates ?? []
    : [];

  const loanProducts = ((productsResult.data as LoanProductRecord[] | null) ?? []).map(
    (product) =>
      ({
        description: product.description,
        id: product.id,
        name: product.name,
        interestRate: parseMoney(product.interest_rate),
        interestType: product.interest_type,
        maximumDisbursableAmount: product.maximum_disbursable_amount
          ? parseMoney(product.maximum_disbursable_amount)
          : null,
        minAmount: parseMoney(product.min_amount),
        maxAmount: parseMoney(product.max_amount),
        minTenureMonths: product.min_tenure_months,
        maxTenureMonths: product.max_tenure_months,
        maxLoanToSavingsRatio: parseMoney(product.max_loan_to_savings_ratio),
        penaltyRate: parseMoney(product.penalty_rate),
        processingFeeRate: parseMoney(product.processing_fee_rate),
        termsSummary: product.terms_summary,
        isActive: product.is_active,
      }) satisfies LoanProductOption,
  );

  const guarantorProfileMap = new Map(
    guarantorProfiles.map((profile) => [
      profile.id,
      profile,
    ]) satisfies Array<[string, ProfileRecord]>,
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
    guarantorCandidateProfiles
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
    memberTier !== "tier_3"
      ? "Complete your next-of-kin and KYC profile before applying for a loan."
      : null,
    profileResult.error?.message,
    memberResult.error?.message,
    productsResult.error?.message,
    applicationsResult.error?.message,
    savingsResult.error?.message,
    guarantorsResult.error?.message,
    supportResponse.ok
      ? null
      : supportPayload?.message ?? "Unable to load eligible guarantors.",
  ].filter(Boolean);

  const profile = (profileResult.data as ProfileRecord | null) ?? null;

  return {
    applications,
    dataError: errors.length > 0 ? errors.join(" ") : null,
    guarantorCandidates,
    loanProducts,
    memberName: profile?.full_name ?? user.email ?? "Member",
    memberNumber: profile?.member_number ?? null,
    savingsBalance,
  };
}

export default function PortalLoansPage() {
  const { data, error, isLoading } = useStaticPageData(loadPortalLoansPage);

  if (isLoading && !data) return <StaticPageLoading label="Loading loan products…" />;
  if (!data) return <StaticPageError>{error ?? "Loan records are unavailable."}</StaticPageError>;

  return <MemberLoansPageView {...data} dataError={data.dataError ?? error} />;
}
