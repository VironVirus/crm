import "server-only";

import { ensureCurrentMonthlyDues } from "@/lib/cooperative-finance-server";
import { type LoanStatus } from "@/lib/loans";
import {
  type DashboardKpiSnapshot,
  type DashboardLoanStatusPoint,
  type DashboardMemberGrowthPoint,
  type DashboardMonthlyComparisonPoint,
  formatDashboardMonth,
  getLoanStatusColor,
  getLoanStatusLabel,
  parseDashboardNumeric,
  roundDashboardCurrency,
} from "@/lib/dashboard";
import { loadRecentDashboardActivity } from "@/lib/dashboard/activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type MemberRecord = {
  created_at: string;
  id: string;
  onboarding_status: "pending" | "registered";
};

type ProfileRecord = {
  full_name: string;
  id: string;
  member_number: string | null;
  status: "active" | "inactive" | "suspended";
};

type SavingsAccountRecord = {
  balance: number | string | null;
  id: string;
  member_id: string;
};

type SavingsDepositRecord = {
  amount: number | string | null;
  transaction_date: string;
};

type LoanRecord = {
  amount_disbursed: number | string | null;
  disbursed_at: string | null;
  id: string;
  member_id: string;
  outstanding_balance: number | string | null;
  status: LoanStatus;
};

type LoanRepaymentRecord = {
  amount: number | string | null;
  transaction_date: string;
};

type LoanRepaymentScheduleRecord = {
  due_date: string;
  loan_id: string;
  status: "overdue" | "paid" | "partial" | "pending";
};

type ShareHoldingRecord = {
  total_value: number | string | null;
};

type SharePurchaseRecord = {
  amount: number | string | null;
  transaction_date: string;
};

type MemberInvestmentRecord = {
  amount: number | string | null;
};

type PendingChargeRecord = {
  amount: number | string | null;
  charge_category:
    | "manual"
    | "meeting_penalty"
    | "monthly_due"
    | "occasion_levy";
};

function toMonthKey(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function getDashboardWindow() {
  const currentMonth = new Date();
  currentMonth.setUTCDate(1);
  currentMonth.setUTCHours(0, 0, 0, 0);

  const startMonth = new Date(currentMonth);
  startMonth.setUTCMonth(startMonth.getUTCMonth() - 11);

  const monthKeys: string[] = [];

  for (let index = 0; index < 12; index += 1) {
    const monthDate = new Date(startMonth);
    monthDate.setUTCMonth(startMonth.getUTCMonth() + index);
    monthKeys.push(
      `${monthDate.getUTCFullYear()}-${String(
        monthDate.getUTCMonth() + 1,
      ).padStart(2, "0")}`,
    );
  }

  return {
    currentMonthKey: monthKeys[monthKeys.length - 1],
    currentMonthStartTimestamp: `${monthKeys[monthKeys.length - 1]}-01T00:00:00.000Z`,
    monthKeys,
    startTimestamp: `${monthKeys[0]}-01T00:00:00.000Z`,
    today: new Date().toISOString().slice(0, 10),
  };
}

function buildMonthlyComparisonSeries({
  loanRecords,
  monthKeys,
  savingsDeposits,
}: {
  loanRecords: LoanRecord[];
  monthKeys: string[];
  savingsDeposits: SavingsDepositRecord[];
}) {
  const monthMap = new Map(
    monthKeys.map((monthKey) => [
      monthKey,
      {
        loanDisbursements: 0,
        savingsDeposits: 0,
      },
    ]),
  );

  savingsDeposits.forEach((transaction) => {
    const monthKey = toMonthKey(transaction.transaction_date);

    if (!monthKey || !monthMap.has(monthKey)) {
      return;
    }

    monthMap.get(monthKey)!.savingsDeposits += parseDashboardNumeric(
      transaction.amount,
    );
  });

  loanRecords.forEach((loan) => {
    if (!loan.disbursed_at) {
      return;
    }

    const monthKey = toMonthKey(loan.disbursed_at);

    if (!monthKey || !monthMap.has(monthKey)) {
      return;
    }

    monthMap.get(monthKey)!.loanDisbursements += parseDashboardNumeric(
      loan.amount_disbursed,
    );
  });

  return monthKeys.map((monthKey) => ({
    label: formatDashboardMonth(monthKey),
    loanDisbursements: roundDashboardCurrency(
      monthMap.get(monthKey)?.loanDisbursements ?? 0,
    ),
    monthKey,
    savingsDeposits: roundDashboardCurrency(
      monthMap.get(monthKey)?.savingsDeposits ?? 0,
    ),
  })) satisfies DashboardMonthlyComparisonPoint[];
}

function buildLoanStatusDistribution(loanRecords: LoanRecord[]) {
  const counts = loanRecords.reduce<Record<LoanStatus, number>>(
    (totals, loan) => {
      totals[loan.status] += 1;
      return totals;
    },
    {
      active: 0,
      completed: 0,
      defaulted: 0,
    },
  );

  return (["active", "completed", "defaulted"] as const).map((status) => ({
    color: getLoanStatusColor(status),
    label: getLoanStatusLabel(status),
    status,
    value: counts[status],
  })) satisfies DashboardLoanStatusPoint[];
}

function buildMemberGrowthSeries({
  members,
  monthKeys,
}: {
  members: MemberRecord[];
  monthKeys: string[];
}) {
  const monthlyCounts = new Map(monthKeys.map((monthKey) => [monthKey, 0]));

  members.forEach((member) => {
    const monthKey = toMonthKey(member.created_at);

    if (!monthKey || !monthlyCounts.has(monthKey)) {
      return;
    }

    monthlyCounts.set(monthKey, (monthlyCounts.get(monthKey) ?? 0) + 1);
  });

  let cumulativeMembers = 0;

  return monthKeys.map((monthKey) => {
    const membersJoined = monthlyCounts.get(monthKey) ?? 0;

    cumulativeMembers += membersJoined;

    return {
      cumulativeMembers,
      label: formatDashboardMonth(monthKey),
      membersJoined,
      monthKey,
    } satisfies DashboardMemberGrowthPoint;
  });
}

export async function getAdminDashboardData() {
  const admin = createSupabaseAdminClient();
  const duesGenerationError = await ensureCurrentMonthlyDues(admin);
  const {
    currentMonthKey,
    currentMonthStartTimestamp,
    monthKeys,
    startTimestamp,
    today,
  } = getDashboardWindow();

  const [
    membersResult,
    profilesResult,
    savingsAccountsResult,
    savingsDepositsResult,
    loansResult,
    loanRepaymentsResult,
    overdueSchedulesResult,
    memberSharesResult,
    sharePurchasesResult,
    pendingLoanReviewCountResult,
    memberInvestmentsResult,
    pendingChargesResult,
    recentActivityResult,
  ] = await Promise.all([
    admin
      .from("members")
      .select("id, onboarding_status, created_at")
      .eq("onboarding_status", "registered"),
    admin
      .from("profiles")
      .select("id, full_name, member_number, status")
      .order("full_name"),
    admin.from("savings_accounts").select("id, member_id, balance"),
    admin
      .from("savings_transactions")
      .select("amount, transaction_date")
      .eq("transaction_type", "deposit")
      .gte("transaction_date", startTimestamp),
    admin
      .from("loans")
      .select(
        "id, member_id, amount_disbursed, disbursed_at, outstanding_balance, status",
      ),
    admin
      .from("loan_transactions")
      .select("amount, transaction_date")
      .eq("transaction_type", "repayment")
      .gte("transaction_date", currentMonthStartTimestamp),
    admin
      .from("loan_repayment_schedule")
      .select("loan_id, due_date, status")
      .in("status", ["pending", "partial", "overdue"]),
    admin.from("member_shares").select("total_value"),
    admin
      .from("share_transactions")
      .select("amount, transaction_date")
      .eq("transaction_type", "purchase")
      .gte("transaction_date", currentMonthStartTimestamp),
    admin
      .from("loan_applications")
      .select("id", { count: "exact", head: true })
      .in("status", ["submitted", "under_review"]),
    admin.from("member_investments").select("amount"),
    admin
      .from("member_charges")
      .select("amount, charge_category")
      .eq("status", "pending"),
    loadRecentDashboardActivity(admin),
  ]);

  const errors = [
    membersResult.error?.message,
    profilesResult.error?.message,
    savingsAccountsResult.error?.message,
    savingsDepositsResult.error?.message,
    loansResult.error?.message,
    loanRepaymentsResult.error?.message,
    overdueSchedulesResult.error?.message,
    memberSharesResult.error?.message,
    sharePurchasesResult.error?.message,
    pendingLoanReviewCountResult.error?.message,
    memberInvestmentsResult.error?.message,
    pendingChargesResult.error?.message,
    duesGenerationError,
    recentActivityResult.error,
  ].filter(Boolean);

  const registeredMembers =
    (membersResult.data as MemberRecord[] | null) ?? [];
  const profiles = (profilesResult.data as ProfileRecord[] | null) ?? [];
  const savingsAccounts =
    (savingsAccountsResult.data as SavingsAccountRecord[] | null) ?? [];
  const savingsDeposits =
    (savingsDepositsResult.data as SavingsDepositRecord[] | null) ?? [];
  const loans = (loansResult.data as LoanRecord[] | null) ?? [];
  const loanRepayments =
    (loanRepaymentsResult.data as LoanRepaymentRecord[] | null) ?? [];
  const overdueSchedules =
    (overdueSchedulesResult.data as LoanRepaymentScheduleRecord[] | null) ?? [];
  const shareHoldings =
    (memberSharesResult.data as ShareHoldingRecord[] | null) ?? [];
  const sharePurchases =
    (sharePurchasesResult.data as SharePurchaseRecord[] | null) ?? [];
  const memberInvestments =
    (memberInvestmentsResult.data as MemberInvestmentRecord[] | null) ?? [];
  const pendingCharges =
    (pendingChargesResult.data as PendingChargeRecord[] | null) ?? [];

  const profileMap = new Map(
    profiles.map((profile) => [profile.id, profile] as const),
  );

  const totalActiveMembers = registeredMembers.filter((member) => {
    const profile = profileMap.get(member.id);
    return profile?.status === "active";
  }).length;

  const totalSavingsBalance = roundDashboardCurrency(
    savingsAccounts.reduce(
      (total, account) => total + parseDashboardNumeric(account.balance),
      0,
    ),
  );

  const totalLoansOutstanding = roundDashboardCurrency(
    loans.reduce(
      (total, loan) => total + parseDashboardNumeric(loan.outstanding_balance),
      0,
    ),
  );

  const totalSharesCapital = roundDashboardCurrency(
    shareHoldings.reduce(
      (total, shareHolding) =>
        total + parseDashboardNumeric(shareHolding.total_value),
      0,
    ),
  );

  const totalMemberInvestments = roundDashboardCurrency(
    memberInvestments.reduce(
      (total, investment) => total + parseDashboardNumeric(investment.amount),
      0,
    ),
  );

  function totalPendingChargesByCategory(
    category: PendingChargeRecord["charge_category"],
  ) {
    return roundDashboardCurrency(
      pendingCharges
        .filter((charge) => charge.charge_category === category)
        .reduce(
          (total, charge) => total + parseDashboardNumeric(charge.amount),
          0,
        ),
    );
  }

  const collectionsThisMonth = roundDashboardCurrency(
    savingsDeposits
      .filter(
        (transaction) => toMonthKey(transaction.transaction_date) === currentMonthKey,
      )
      .reduce(
        (total, transaction) => total + parseDashboardNumeric(transaction.amount),
        0,
      ) +
      loanRepayments.reduce(
        (total, transaction) => total + parseDashboardNumeric(transaction.amount),
        0,
      ) +
      sharePurchases.reduce(
        (total, transaction) => total + parseDashboardNumeric(transaction.amount),
        0,
      ),
  );

  const overdueLoanIds = new Set(
    overdueSchedules
      .filter(
        (schedule) =>
          schedule.status === "overdue" || schedule.due_date < today,
      )
      .map((schedule) => schedule.loan_id),
  );

  const kpis: DashboardKpiSnapshot = {
    collectionsThisMonth,
    outstandingMonthlyDues: totalPendingChargesByCategory("monthly_due"),
    outstandingOccasionLevies:
      totalPendingChargesByCategory("occasion_levy"),
    outstandingPenalties: totalPendingChargesByCategory("meeting_penalty"),
    overdueLoansCount: overdueLoanIds.size,
    pendingLoanReviewCount: pendingLoanReviewCountResult.count ?? 0,
    totalActiveMembers,
    totalLoansOutstanding,
    totalMemberInvestments,
    totalSavingsBalance,
    totalSharesCapital,
  };

  return {
    dataError: errors.join(" ") || null,
    initialRecentActivity: recentActivityResult.items,
    kpis,
    loanStatusDistribution: buildLoanStatusDistribution(loans),
    memberGrowth: buildMemberGrowthSeries({
      members: registeredMembers,
      monthKeys,
    }),
    monthlySavingsVsLoanDisbursements: buildMonthlyComparisonSeries({
      loanRecords: loans.filter((loan) => {
        if (!loan.disbursed_at) {
          return false;
        }

        return loan.disbursed_at >= startTimestamp;
      }),
      monthKeys,
      savingsDeposits,
    }),
  };
}
