import { redirect } from "next/navigation";
import PortalActionsPageView from "@/features/portal/actions/page-view";
import { isFlutterwaveMockModeEnabled } from "@/lib/env/server";
import { getMemberTier } from "@/lib/member-tier";
import { ensureMemberRecord } from "@/lib/members";
import { parseMoney, type LoanStatus } from "@/lib/loans";
import {
  type MemberPaymentLoanOption,
  type MemberPaymentShareConfig,
} from "@/lib/payments";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ProfileRecord = {
  full_name: string;
  member_number: string | null;
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

type LoanRecord = {
  application_id: string;
  id: string;
  monthly_repayment: number | string | null;
  outstanding_balance: number | string | null;
  status: LoanStatus;
};

type LoanApplicationRecord = {
  id: string;
  loan_product_id: string;
};

type LoanProductRecord = {
  id: string;
  name: string;
};

type ShareConfigRecord = {
  minimum_shares: number;
  share_value: number | string | null;
};

export default async function PortalActionsPage({
  searchParams,
}: {
  searchParams?: {
    payment?: string;
  };
}) {
  const supabase = createServerSupabaseClient();
  const admin = createSupabaseAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/portal/actions");
  }

  const profileResult = await supabase
    .from("profiles")
    .select("full_name, member_number")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileResult.data as ProfileRecord | null;
  const memberResult = await ensureMemberRecord(admin, {
    memberId: user.id,
    memberNumber: profile?.member_number ?? null,
    select:
      "onboarding_status, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
  });
  const member = memberResult.data as MemberRecord | null;

  const loansResult = await supabase
    .from("loans")
    .select("id, application_id, monthly_repayment, outstanding_balance, status")
    .eq("member_id", user.id)
    .in("status", ["active", "defaulted"])
    .order("disbursed_at", { ascending: false });
  const loans = (loansResult.data as LoanRecord[] | null) ?? [];
  const applicationIds = Array.from(
    new Set(loans.map((loan) => loan.application_id).filter(Boolean)),
  );
  const loanApplicationsResult =
    applicationIds.length > 0
      ? await supabase
          .from("loan_applications")
          .select("id, loan_product_id")
          .in("id", applicationIds)
      : { data: [] as LoanApplicationRecord[], error: null };
  const loanProductIds = Array.from(
    new Set(
      ((loanApplicationsResult.data as LoanApplicationRecord[] | null) ?? []).map(
        (application) => application.loan_product_id,
      ),
    ),
  );
  const loanProductsResult =
    loanProductIds.length > 0
      ? await supabase
          .from("loan_products")
          .select("id, name")
          .in("id", loanProductIds)
      : { data: [] as LoanProductRecord[], error: null };
  const shareConfigResult = await supabase
    .from("share_config")
    .select("share_value, minimum_shares")
    .limit(1)
    .maybeSingle();

  const applicationMap = new Map(
    (((loanApplicationsResult.data as LoanApplicationRecord[] | null) ?? []).map(
      (application) => [application.id, application] as const,
    )),
  );
  const productMap = new Map(
    (((loanProductsResult.data as LoanProductRecord[] | null) ?? []).map(
      (product) => [product.id, product] as const,
    )),
  );
  const paymentLoanOptions = loans.map(
    (loan) =>
      ({
        id: loan.id,
        monthlyRepayment: parseMoney(loan.monthly_repayment),
        outstandingBalance: parseMoney(loan.outstanding_balance),
        productName:
          productMap.get(applicationMap.get(loan.application_id)?.loan_product_id ?? "")
            ?.name ?? "Cooperative loan",
      }) satisfies MemberPaymentLoanOption,
  );
  const shareConfigRecord = shareConfigResult.data as ShareConfigRecord | null;
  const shareConfig: MemberPaymentShareConfig | null = shareConfigRecord
    ? {
        minimumShares: shareConfigRecord.minimum_shares,
        shareValue: parseMoney(shareConfigRecord.share_value),
      }
    : null;

  return (
    <PortalActionsPageView
      demoPaymentsEnabled={isFlutterwaveMockModeEnabled()}
      memberId={user.id}
      memberName={profile?.full_name ?? user.email ?? "Member"}
      memberNumber={profile?.member_number ?? null}
      memberTier={getMemberTier(member)}
      paymentLoanOptions={paymentLoanOptions}
      paymentStatus={searchParams?.payment === "success" ? "success" : null}
      shareConfig={shareConfig}
    />
  );
}
