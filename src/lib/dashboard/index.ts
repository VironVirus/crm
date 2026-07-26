import { type LoanStatus } from "@/lib/loans";

export type DashboardKpiSnapshot = {
  collectionsThisMonth: number;
  outstandingMonthlyDues: number;
  outstandingOccasionLevies: number;
  outstandingPenalties: number;
  overdueLoansCount: number;
  pendingLoanReviewCount: number;
  totalActiveMembers: number;
  totalLoansOutstanding: number;
  totalMemberInvestments: number;
  totalSavingsBalance: number;
  totalSharesCapital: number;
};

export type DashboardMonthlyComparisonPoint = {
  label: string;
  loanDisbursements: number;
  monthKey: string;
  savingsDeposits: number;
};

export type DashboardLoanStatusPoint = {
  color: string;
  label: string;
  status: LoanStatus;
  value: number;
};

export type DashboardMemberGrowthPoint = {
  cumulativeMembers: number;
  label: string;
  membersJoined: number;
  monthKey: string;
};

export type DashboardRecentActivitySource = "loans" | "savings" | "shares";

export type DashboardRecentActivityItem = {
  amount: number;
  detail: string;
  happenedAt: string;
  id: string;
  memberId: string | null;
  memberName: string;
  memberNumber: string | null;
  paymentReference: string | null;
  source: DashboardRecentActivitySource;
  title: string;
};

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  currency: "NGN",
  maximumFractionDigits: 2,
  style: "currency",
});

const compactNairaFormatter = new Intl.NumberFormat("en-NG", {
  currency: "NGN",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
});

const monthFormatter = new Intl.DateTimeFormat("en-NG", {
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-NG", {
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  year: "numeric",
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en-NG", {
  numeric: "auto",
});

export function parseDashboardNumeric(
  value: number | string | null | undefined,
) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function roundDashboardCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatDashboardNaira(value: number) {
  return nairaFormatter.format(value);
}

export function formatDashboardCompactNaira(value: number) {
  return compactNairaFormatter.format(value);
}

export function formatDashboardMonth(monthKey: string) {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return monthKey;
  }

  return monthFormatter.format(date);
}

export function formatDashboardDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return dateTimeFormatter.format(date);
}

export function formatDashboardRelativeTime(value: string | null | undefined) {
  if (!value) {
    return "Just now";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  const diffMs = date.getTime() - Date.now();
  const absDiffMs = Math.abs(diffMs);

  const units: Array<{
    ms: number;
    unit: Intl.RelativeTimeFormatUnit;
  }> = [
    { ms: 1000, unit: "second" },
    { ms: 60_000, unit: "minute" },
    { ms: 3_600_000, unit: "hour" },
    { ms: 86_400_000, unit: "day" },
    { ms: 604_800_000, unit: "week" },
    { ms: 2_629_800_000, unit: "month" },
    { ms: 31_557_600_000, unit: "year" },
  ];

  for (let index = units.length - 1; index >= 0; index -= 1) {
    if (absDiffMs >= units[index].ms || index === 0) {
      return relativeTimeFormatter.format(
        Math.round(diffMs / units[index].ms),
        units[index].unit,
      );
    }
  }

  return "Just now";
}

export function getLoanStatusLabel(status: LoanStatus) {
  switch (status) {
    case "completed":
      return "Completed";
    case "defaulted":
      return "Defaulted";
    case "active":
    default:
      return "Active";
  }
}

export function getLoanStatusColor(status: LoanStatus) {
  switch (status) {
    case "completed":
      return "#38bdf8";
    case "defaulted":
      return "#fb7185";
    case "active":
    default:
      return "#34d399";
  }
}
