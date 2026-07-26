import { redirect } from "next/navigation";
import MemberDashboardPageView from "@/features/portal/dashboard/page-view";
import {
  getCurrentMonthStart,
  type ChargeCategory,
  type ChargeStatus,
  type PortalChargeItem,
  type PortalInvestmentPosition,
  type PortalMonthlyDueSummary,
} from "@/lib/cooperative-finance";
import { ensureCurrentMonthlyDues } from "@/lib/cooperative-finance-server";
import { getMemberTier } from "@/lib/member-tier";
import { syncMeetingState } from "@/lib/meetings/server";
import { ensureMemberRecord } from "@/lib/members";
import {
  parseMoney,
  type LoanStatus,
} from "@/lib/loans";
import {
  type SavingsAccountOption,
  type SavingsAccountType,
  type SavingsTransactionRow,
  buildSavingsGrowthSeries,
  parseSupabaseNumeric,
} from "@/lib/savings";
import {
  type PortalDashboardActiveLoanSummary,
  type PortalDashboardInstallment,
  type PortalDashboardRecentTransaction,
  type PortalDashboardShareSummary,
} from "@/lib/portal-dashboard";
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
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

type SavingsAccountRecord = {
  account_type: SavingsAccountType;
  balance: number | string | null;
  created_at: string;
  id: string;
  interest_rate: number | string | null;
  maturity_date: string | null;
  status: "active" | "closed";
};

type SavingsTransactionRecord = {
  amount: number | string | null;
  balance_after: number | string | null;
  id: string;
  narration: string | null;
  payment_reference: string | null;
  savings_account_id: string;
  transaction_date: string;
  transaction_type: SavingsTransactionRow["transactionType"];
};

type LoanRecord = {
  amount_disbursed: number | string | null;
  application_id: string;
  disbursed_at: string | null;
  id: string;
  monthly_repayment: number | string | null;
  outstanding_balance: number | string | null;
  status: LoanStatus;
  total_repayable: number | string | null;
};

type LoanRepaymentScheduleRecord = {
  amount_paid: number | string | null;
  due_date: string;
  id: string;
  loan_id: string;
  status: PortalDashboardInstallment["status"];
  total_due: number | string | null;
};

type LoanApplicationRecord = {
  id: string;
  loan_product_id: string;
};

type LoanProductRecord = {
  id: string;
  name: string;
};

type LoanTransactionRecord = {
  amount: number | string | null;
  id: string;
  loan_id: string;
  payment_reference: string | null;
  transaction_date: string;
  transaction_type: "disbursement" | "penalty" | "repayment";
};

type ShareHoldingRecord = {
  total_shares: number;
  total_value: number | string | null;
};

type ShareTransactionRecord = {
  amount: number | string | null;
  id: string;
  notes: string | null;
  shares_count: number;
  transaction_date: string;
  transaction_type: "purchase" | "transfer_in" | "transfer_out";
};

type LoanGuarantorRecord = {
  id: string;
};

type MemberChargeRecord = {
  amount: number | string | null;
  charge_category: ChargeCategory;
  created_at: string;
  due_at: string | null;
  id: string;
  status: ChargeStatus;
  title: string;
};

type MemberInvestmentRecord = {
  amount: number | string | null;
  id: string;
  investment_plan_id: string;
};

type InvestmentPlanRecord = {
  id: string;
  name: string;
  projected_return_rate: number | string | null;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toTitleLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getLoanProductName({
  applicationMap,
  loan,
  productMap,
}: {
  applicationMap: Map<string, LoanApplicationRecord>;
  loan: LoanRecord;
  productMap: Map<string, LoanProductRecord>;
}) {
  const application = applicationMap.get(loan.application_id);
  const product = application
    ? productMap.get(application.loan_product_id)
    : null;

  return product?.name ?? "Cooperative loan";
}

export default async function MemberDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const admin = createSupabaseAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/portal");
  }

  const duesGenerationError = await ensureCurrentMonthlyDues(admin);
  await syncMeetingState(admin);

  const [
    profileResult,
    savingsAccountsResult,
    loansResult,
    guarantorRequestsResult,
    shareHoldingResult,
    openMeetingsCountResult,
    pendingChargesResult,
    memberInvestmentsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, member_number")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("savings_accounts")
      .select(
        "id, account_type, balance, interest_rate, maturity_date, status, created_at",
      )
      .eq("member_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("loans")
      .select(
        "id, application_id, monthly_repayment, total_repayable, amount_disbursed, outstanding_balance, status, disbursed_at",
      )
      .eq("member_id", user.id)
      .order("disbursed_at", { ascending: false }),
    supabase
      .from("loan_guarantors")
      .select("id")
      .eq("guarantor_member_id", user.id)
      .eq("status", "invited"),
    supabase
      .from("member_shares")
      .select("total_shares, total_value")
      .eq("member_id", user.id)
      .maybeSingle(),
    admin
      .from("meetings")
      .select("id", { count: "exact", head: true })
      .eq("status", "scheduled"),
    supabase
      .from("member_charges")
      .select(
        "id, amount, charge_category, title, due_at, status, created_at",
      )
      .eq("member_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("member_investments")
      .select("id, investment_plan_id, amount")
      .eq("member_id", user.id),
  ]);
  const profile = profileResult.data as ProfileRecord | null;
  const ensuredMemberResult = await ensureMemberRecord(admin, {
    memberId: user.id,
    memberNumber: profile?.member_number ?? null,
    select:
      "next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
  });
  const member = ensuredMemberResult.data as MemberRecord | null;

  const savingsAccounts =
    (savingsAccountsResult.data as SavingsAccountRecord[] | null) ?? [];
  const loans = (loansResult.data as LoanRecord[] | null) ?? [];
  const loanIds = loans.map((loan) => loan.id);
  const loanApplicationIds = Array.from(
    new Set(loans.map((loan) => loan.application_id)),
  );
  const savingsAccountIds = savingsAccounts.map((account) => account.id);

  const [
    savingsTransactionsResult,
    loanSchedulesResult,
    loanApplicationsResult,
    loanTransactionsResult,
    shareTransactionsResult,
  ] = await Promise.all([
    savingsAccountIds.length > 0
      ? supabase
          .from("savings_transactions")
          .select(
            "id, savings_account_id, transaction_type, amount, balance_after, payment_reference, narration, transaction_date",
          )
          .in("savings_account_id", savingsAccountIds)
          .order("transaction_date", { ascending: false })
          .limit(24)
      : Promise.resolve({ data: [] as SavingsTransactionRecord[], error: null }),
    loanIds.length > 0
      ? supabase
          .from("loan_repayment_schedule")
          .select("id, loan_id, due_date, total_due, amount_paid, status")
          .in("loan_id", loanIds)
          .order("due_date", { ascending: true })
      : Promise.resolve({ data: [] as LoanRepaymentScheduleRecord[], error: null }),
    loanApplicationIds.length > 0
      ? supabase
          .from("loan_applications")
          .select("id, loan_product_id")
          .in("id", loanApplicationIds)
      : Promise.resolve({ data: [] as LoanApplicationRecord[], error: null }),
    loanIds.length > 0
      ? supabase
          .from("loan_transactions")
          .select("id, loan_id, transaction_type, amount, payment_reference, transaction_date")
          .in("loan_id", loanIds)
          .order("transaction_date", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as LoanTransactionRecord[], error: null }),
    supabase
      .from("share_transactions")
      .select("id, transaction_type, amount, shares_count, notes, transaction_date")
      .eq("member_id", user.id)
      .order("transaction_date", { ascending: false })
      .limit(10),
  ]);

  const loanApplications =
    (loanApplicationsResult.data as LoanApplicationRecord[] | null) ?? [];
  const loanProductIds = Array.from(
    new Set(loanApplications.map((application) => application.loan_product_id)),
  );
  const loanProductsResult =
    loanProductIds.length > 0
      ? await supabase
          .from("loan_products")
          .select("id, name")
          .in("id", loanProductIds)
      : { data: [] as LoanProductRecord[], error: null };

  const applicationMap = new Map(
    loanApplications.map((application) => [application.id, application] as const),
  );
  const productMap = new Map(
    (((loanProductsResult.data as LoanProductRecord[] | null) ?? []).map(
      (product) => [product.id, product] as const,
    )),
  );
  const accountMap = new Map(
    savingsAccounts.map((account) => [account.id, account] as const),
  );
  const loanMap = new Map(loans.map((loan) => [loan.id, loan] as const));

  const dashboardSavingsAccounts = savingsAccounts.map(
    (account) =>
      ({
        accountType: account.account_type,
        balance: parseSupabaseNumeric(account.balance),
        createdAt: account.created_at,
        id: account.id,
        interestRate: parseSupabaseNumeric(account.interest_rate),
        maturityDate: account.maturity_date,
        status: account.status,
      }) satisfies SavingsAccountOption,
  );
  const savingsTransactions = (
    (savingsTransactionsResult.data as SavingsTransactionRecord[] | null) ?? []
  ).map(
    (transaction) =>
      ({
        accountType:
          accountMap.get(transaction.savings_account_id)?.account_type ??
          "mandatory",
        amount: parseSupabaseNumeric(transaction.amount),
        balanceAfter: parseSupabaseNumeric(transaction.balance_after),
        createdBy: user.id,
        id: transaction.id,
        narration: transaction.narration,
        paymentReference: transaction.payment_reference,
        savingsAccountId: transaction.savings_account_id,
        transactionDate: transaction.transaction_date,
        transactionType: transaction.transaction_type,
      }) satisfies SavingsTransactionRow,
  );

  const summarySavingsAccounts = dashboardSavingsAccounts.filter(
    (account) =>
      account.status === "active" &&
      (account.accountType === "mandatory" || account.accountType === "voluntary"),
  );
  const summarySavingsAccountIds = new Set(
    summarySavingsAccounts.map((account) => account.id),
  );
  const savingsBalance = summarySavingsAccounts.reduce(
    (total, account) => total + account.balance,
    0,
  );
  const savingsTrend = buildSavingsGrowthSeries(
    summarySavingsAccounts,
    savingsTransactions.filter((transaction) =>
      summarySavingsAccountIds.has(transaction.savingsAccountId),
    ),
  );

  const activeLoans = loans.filter(
    (loan) => loan.status === "active" || loan.status === "defaulted",
  );
  const primaryLoan =
    activeLoans.find((loan) => loan.status === "active") ?? activeLoans[0] ?? null;
  const loanSchedules =
    (loanSchedulesResult.data as LoanRepaymentScheduleRecord[] | null) ?? [];
  const schedulesByLoanId = new Map<string, LoanRepaymentScheduleRecord[]>();

  loanSchedules.forEach((schedule) => {
    const schedules = schedulesByLoanId.get(schedule.loan_id) ?? [];
    schedules.push(schedule);
    schedulesByLoanId.set(schedule.loan_id, schedules);
  });

  const activeLoan: PortalDashboardActiveLoanSummary | null = primaryLoan
    ? (() => {
        const upcomingInstallments = (schedulesByLoanId.get(primaryLoan.id) ?? [])
          .filter((schedule) => schedule.status !== "paid")
          .slice(0, 3)
          .map(
            (schedule) =>
              ({
                amountPaid: parseMoney(schedule.amount_paid),
                dueDate: schedule.due_date,
                id: schedule.id,
                status: schedule.status,
                totalDue: parseMoney(schedule.total_due),
              }) satisfies PortalDashboardInstallment,
          );
        const outstandingBalance = parseMoney(primaryLoan.outstanding_balance);
        const totalRepayable =
          parseMoney(primaryLoan.total_repayable) ||
          parseMoney(primaryLoan.amount_disbursed);
        const totalRepaid = Math.max(0, totalRepayable - outstandingBalance);

        return {
          id: primaryLoan.id,
          monthlyRepayment: parseMoney(primaryLoan.monthly_repayment),
          nextRepaymentAmount: upcomingInstallments[0]?.totalDue ?? 0,
          nextRepaymentDate: upcomingInstallments[0]?.dueDate ?? null,
          outstandingBalance,
          productName: getLoanProductName({
            applicationMap,
            loan: primaryLoan,
            productMap,
          }),
          progressPercent:
            totalRepayable > 0
              ? clampPercent((totalRepaid / totalRepayable) * 100)
              : 0,
          totalRepaid,
          totalRepayable,
          upcomingInstallments,
        } satisfies PortalDashboardActiveLoanSummary;
      })()
    : null;

  const shareHolding = shareHoldingResult.data as ShareHoldingRecord | null;
  const shares: PortalDashboardShareSummary = {
    totalShares: shareHolding?.total_shares ?? 0,
    totalValue: parseMoney(shareHolding?.total_value),
  };

  const loanTransactions =
    (loanTransactionsResult.data as LoanTransactionRecord[] | null) ?? [];
  const shareTransactions =
    (shareTransactionsResult.data as ShareTransactionRecord[] | null) ?? [];
  const recentTransactions: PortalDashboardRecentTransaction[] = [
    ...savingsTransactions.slice(0, 10).map((transaction) => ({
      amount:
        transaction.transactionType === "withdrawal"
          ? transaction.amount * -1
          : transaction.amount,
      date: transaction.transactionDate,
      detail:
        transaction.narration?.trim() ||
        `${toTitleLabel(transaction.accountType)} ${toTitleLabel(
          transaction.transactionType,
        )}`,
      id: `savings:${transaction.id}`,
      source: "savings" as const,
    })),
    ...loanTransactions.map((transaction) => {
      const loan = loanMap.get(transaction.loan_id);

      return {
        amount:
          transaction.transaction_type === "disbursement"
            ? parseMoney(transaction.amount) * -1
            : parseMoney(transaction.amount),
        date: transaction.transaction_date,
        detail: `${getLoanProductName({
          applicationMap,
          loan: loan ?? {
            amount_disbursed: null,
            application_id: "",
            disbursed_at: null,
            id: transaction.loan_id,
            monthly_repayment: null,
            outstanding_balance: null,
            status: "active",
            total_repayable: null,
          },
          productMap,
        })} ${toTitleLabel(transaction.transaction_type)}`,
        id: `loan:${transaction.id}`,
        source: "loan" as const,
      };
    }),
    ...shareTransactions.map((transaction) => ({
      amount:
        transaction.transaction_type === "transfer_out"
          ? parseMoney(transaction.amount) * -1
          : parseMoney(transaction.amount),
      date: transaction.transaction_date,
      detail:
        transaction.notes?.trim() ||
        `${toTitleLabel(transaction.transaction_type)} · ${transaction.shares_count} share${transaction.shares_count === 1 ? "" : "s"}`,
      id: `share:${transaction.id}`,
      source: "share" as const,
    })),
  ]
    .sort(
      (left, right) =>
        new Date(right.date).getTime() - new Date(left.date).getTime(),
    )
    .slice(0, 5);

  const guarantorRequests =
    (guarantorRequestsResult.data as LoanGuarantorRecord[] | null) ?? [];
  const pendingCharges =
    (pendingChargesResult.data as MemberChargeRecord[] | null) ?? [];
  const memberInvestments =
    (memberInvestmentsResult.data as MemberInvestmentRecord[] | null) ?? [];
  const investmentPlanIds = Array.from(
    new Set(memberInvestments.map((investment) => investment.investment_plan_id)),
  );
  const investmentPlansResult =
    investmentPlanIds.length > 0
      ? await supabase
          .from("investment_plans")
          .select("id, name, projected_return_rate")
          .in("id", investmentPlanIds)
      : { data: [] as InvestmentPlanRecord[], error: null };
  const investmentPlanMap = new Map(
    ((investmentPlansResult.data as InvestmentPlanRecord[] | null) ?? []).map(
      (plan) => [plan.id, plan] as const,
    ),
  );
  const investmentPositionMap = new Map<string, PortalInvestmentPosition>();

  memberInvestments.forEach((investment) => {
    const plan = investmentPlanMap.get(investment.investment_plan_id);
    const current = investmentPositionMap.get(investment.investment_plan_id) ?? {
      amount: 0,
      planId: investment.investment_plan_id,
      planName: plan?.name ?? "Investment plan",
      projectedReturnRate:
        plan?.projected_return_rate === null ||
        plan?.projected_return_rate === undefined
          ? null
          : parseMoney(plan.projected_return_rate),
    };
    current.amount += parseMoney(investment.amount);
    investmentPositionMap.set(investment.investment_plan_id, current);
  });
  const investmentPositions = Array.from(investmentPositionMap.values()).sort(
    (left, right) => right.amount - left.amount,
  );
  const totalInvestmentAmount = investmentPositions.reduce(
    (total, position) => total + position.amount,
    0,
  );
  const pendingChargeItems: PortalChargeItem[] = pendingCharges
    .filter((charge) => charge.status === "pending")
    .map((charge) => ({
      amount: parseMoney(charge.amount),
      category: charge.charge_category,
      dueAt: charge.due_at,
      id: charge.id,
      status: charge.status,
      title: charge.title,
    }));
  const pendingChargesAmount = pendingCharges.reduce(
    (total, charge) =>
      charge.status === "pending" ? total + parseMoney(charge.amount) : total,
    0,
  );
  const currentMonthStart = getCurrentMonthStart();
  const currentMonthlyDueRecord = pendingCharges.find(
    (charge) =>
      charge.charge_category === "monthly_due" &&
      charge.created_at.slice(0, 10) >= currentMonthStart,
  );
  const monthlyDue: PortalMonthlyDueSummary = currentMonthlyDueRecord
    ? {
        amount: parseMoney(currentMonthlyDueRecord.amount),
        dueAt: currentMonthlyDueRecord.due_at,
        status: currentMonthlyDueRecord.status,
      }
    : {
        amount: 10_000,
        dueAt: null,
        status: "pending",
      };
  const errors = [
    profileResult.error?.message,
    ensuredMemberResult.error?.message,
    savingsAccountsResult.error?.message,
    loansResult.error?.message,
    guarantorRequestsResult.error?.message,
    shareHoldingResult.error?.message,
    savingsTransactionsResult.error?.message,
    loanSchedulesResult.error?.message,
    loanApplicationsResult.error?.message,
    loanTransactionsResult.error?.message,
    shareTransactionsResult.error?.message,
    loanProductsResult.error?.message,
    openMeetingsCountResult.error?.message,
    pendingChargesResult.error?.message,
    memberInvestmentsResult.error?.message,
    investmentPlansResult.error?.message,
    duesGenerationError,
  ].filter(Boolean);

  return (
    <MemberDashboardPageView
      activeLoan={activeLoan}
      dataError={errors.length > 0 ? errors.join(" ") : null}
      memberName={profile?.full_name ?? user.email ?? "Member"}
      memberNumber={profile?.member_number ?? null}
      memberTier={getMemberTier(member)}
      investmentPositions={investmentPositions}
      monthlyDue={monthlyDue}
      openMeetingCount={openMeetingsCountResult.count ?? 0}
      pendingChargeItems={pendingChargeItems}
      pendingChargesAmount={pendingChargesAmount}
      pendingChargesCount={pendingChargeItems.length}
      pendingGuarantorCount={guarantorRequests.length}
      recentTransactions={recentTransactions}
      savingsBalance={savingsBalance}
      savingsTrend={savingsTrend}
      shares={shares}
      totalInvestmentAmount={totalInvestmentAmount}
    />
  );
}
