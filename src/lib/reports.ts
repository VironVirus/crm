export type ReportMemberOption = {
  email: string;
  fullName: string;
  id: string;
  memberNumber: string | null;
};

export type LoanBookStatus = "current" | "due_today" | "overdue";

export type LoanBookRow = {
  disbursementDate: string | null;
  loanAmount: number;
  loanId: string;
  memberId: string;
  memberName: string;
  memberNumber: string | null;
  nextDueDate: string | null;
  outstandingBalance: number;
  overdueStatus: LoanBookStatus;
  productName: string;
};

export type TrialBalanceRow = {
  accountCode: string;
  accountId: string;
  accountName: string;
  creditTotal: number;
  debitTotal: number;
};

export type MonthlyCollectionsPoint = {
  label: string;
  loanRepayments: number;
  monthKey: string;
  sharePurchases: number;
  savingsDeposits: number;
  totalCollected: number;
};

export type MemberStatementSavingsTransaction = {
  accountType: string;
  amount: number;
  balanceAfter: number;
  narration: string | null;
  paymentReference: string | null;
  transactionDate: string;
  transactionType: string;
};

export type MemberStatementLoanRepayment = {
  amount: number;
  loanProductName: string;
  outstandingBalance: number;
  paymentReference: string | null;
  transactionDate: string;
};

export type MemberStatementDividend = {
  dividendAmount: number;
  financialYear: string;
  paidAt: string | null;
  paymentReference: string | null;
  sharesAtDeclaration: number;
  status: "declared" | "paid";
};

export type MemberStatementData = {
  dividends: MemberStatementDividend[];
  member: {
    address: string;
    dateOfBirth: string;
    email: string;
    fullName: string;
    memberNumber: string | null;
    occupation: string;
    phone: string | null;
    status: "active" | "inactive" | "suspended";
  };
  period: {
    endDate: string;
    startDate: string;
  };
  loanRepayments: MemberStatementLoanRepayment[];
  savingsTransactions: MemberStatementSavingsTransaction[];
  shareHoldings: {
    totalShares: number;
    totalValue: number;
  };
};

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
});

const compactNairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  notation: "compact",
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const monthFormatter = new Intl.DateTimeFormat("en-NG", {
  month: "short",
  year: "numeric",
});

export function parseReportNumeric(
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

export function roundReportCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatReportNaira(value: number) {
  return nairaFormatter.format(value);
}

export function formatReportCompactNaira(value: number) {
  return compactNairaFormatter.format(value);
}

export function formatReportDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return dateFormatter.format(date);
}

export function formatReportMonth(value: string | null | undefined) {
  if (!value) {
    return "Unknown month";
  }

  const date = new Date(`${value}-01T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return monthFormatter.format(date);
}

export function getLoanBookStatusLabel(status: LoanBookStatus) {
  switch (status) {
    case "overdue":
      return "Overdue";
    case "due_today":
      return "Due today";
    case "current":
    default:
      return "Current";
  }
}

export function getLoanBookStatusTone(status: LoanBookStatus) {
  switch (status) {
    case "overdue":
      return "border-rose-400/20 bg-rose-500/10 text-rose-100";
    case "due_today":
      return "border-amber-300/20 bg-amber-400/10 text-amber-100";
    case "current":
    default:
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  }
}

export function getTrialBalanceSummary(rows: TrialBalanceRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.totalCredits += row.creditTotal;
      summary.totalDebits += row.debitTotal;
      return summary;
    },
    {
      totalCredits: 0,
      totalDebits: 0,
    },
  );
}

export function isTrialBalanceBalanced(rows: TrialBalanceRow[]) {
  const summary = getTrialBalanceSummary(rows);
  return (
    Math.abs(
      roundReportCurrency(summary.totalDebits) -
        roundReportCurrency(summary.totalCredits),
    ) < 0.01
  );
}

export function getMonthlyCollectionsSummary(points: MonthlyCollectionsPoint[]) {
  const summary = points.reduce(
    (current, point) => {
      current.totalLoanRepayments += point.loanRepayments;
      current.totalSavingsDeposits += point.savingsDeposits;
      current.totalSharePurchases += point.sharePurchases;
      current.totalCollected += point.totalCollected;
      return current;
    },
    {
      totalCollected: 0,
      totalLoanRepayments: 0,
      totalSavingsDeposits: 0,
      totalSharePurchases: 0,
    },
  );

  return {
    averageMonthlyCollection:
      points.length > 0 ? summary.totalCollected / points.length : 0,
    ...summary,
  };
}
