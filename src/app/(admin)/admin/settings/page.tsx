import AdminSettingsPageView from "@/features/admin/settings/page-view";
import { getRequiredEnvironmentVariables } from "@/lib/env/requirements";
import { parseMoney, type LoanInterestType, type LoanProductOption } from "@/lib/loans";
import { parseSupabaseNumeric, type ShareConfig } from "@/lib/shares";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type LoanProductRecord = {
  description: string | null;
  id: string;
  interest_rate: number | string | null;
  interest_type: LoanInterestType;
  is_active: boolean;
  max_amount: number | string | null;
  max_loan_to_savings_ratio: number | string | null;
  max_tenure_months: number;
  maximum_disbursable_amount: number | string | null;
  min_amount: number | string | null;
  min_tenure_months: number;
  name: string;
  penalty_rate: number | string | null;
  processing_fee_rate: number | string | null;
  terms_summary: string | null;
};

type ShareConfigRecord = {
  created_at: string;
  minimum_shares: number;
  share_value: number | string | null;
};

export default async function AdminSettingsPage() {
  const admin = createSupabaseAdminClient();
  const requirements = getRequiredEnvironmentVariables();
  const [loanProductsResult, shareConfigResult] = await Promise.all([
    admin
      .from("loan_products")
      .select(
        "id, name, description, interest_rate, interest_type, min_amount, max_amount, min_tenure_months, max_tenure_months, max_loan_to_savings_ratio, maximum_disbursable_amount, processing_fee_rate, penalty_rate, terms_summary, is_active",
      )
      .order("name"),
    admin
      .from("share_config")
      .select("share_value, minimum_shares, created_at")
      .limit(1)
      .maybeSingle(),
  ]);

  const loanProducts = ((loanProductsResult.data as LoanProductRecord[] | null) ?? []).map(
    (product) =>
      ({
        description: product.description,
        id: product.id,
        interestRate: parseMoney(product.interest_rate),
        interestType: product.interest_type,
        isActive: product.is_active,
        maxAmount: parseMoney(product.max_amount),
        maxLoanToSavingsRatio: parseMoney(product.max_loan_to_savings_ratio),
        maxTenureMonths: product.max_tenure_months,
        maximumDisbursableAmount: product.maximum_disbursable_amount
          ? parseMoney(product.maximum_disbursable_amount)
          : null,
        minAmount: parseMoney(product.min_amount),
        minTenureMonths: product.min_tenure_months,
        name: product.name,
        penaltyRate: parseMoney(product.penalty_rate),
        processingFeeRate: parseMoney(product.processing_fee_rate),
        termsSummary: product.terms_summary,
      }) satisfies LoanProductOption,
  );
  const shareConfig = shareConfigResult.data
    ? ({
        createdAt: (shareConfigResult.data as ShareConfigRecord).created_at,
        minimumShares: (shareConfigResult.data as ShareConfigRecord).minimum_shares,
        shareValue: parseSupabaseNumeric(
          (shareConfigResult.data as ShareConfigRecord).share_value,
        ),
      } satisfies ShareConfig)
    : null;

  return (
    <AdminSettingsPageView
      loanProducts={loanProducts}
      recommended={requirements.recommended}
      required={requirements.required}
      shareConfig={shareConfig}
    />
  );
}
