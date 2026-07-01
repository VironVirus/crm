export type PortalDashboardInstallment = {
  amountPaid: number;
  dueDate: string;
  id: string;
  status: "overdue" | "paid" | "partial" | "pending";
  totalDue: number;
};

export type PortalDashboardActiveLoanSummary = {
  id: string;
  monthlyRepayment: number;
  nextRepaymentAmount: number;
  nextRepaymentDate: string | null;
  outstandingBalance: number;
  productName: string;
  progressPercent: number;
  totalRepaid: number;
  totalRepayable: number;
  upcomingInstallments: PortalDashboardInstallment[];
};

export type PortalDashboardShareSummary = {
  totalShares: number;
  totalValue: number;
};

export type PortalDashboardTransactionSource = "loan" | "savings" | "share";

export type PortalDashboardRecentTransaction = {
  amount: number;
  date: string;
  detail: string;
  id: string;
  source: PortalDashboardTransactionSource;
};

export function getPortalTransactionLabel(
  source: PortalDashboardTransactionSource,
) {
  switch (source) {
    case "loan":
      return "Loan";
    case "share":
      return "Share";
    case "savings":
    default:
      return "Savings";
  }
}

export function getPortalTransactionTone(
  source: PortalDashboardTransactionSource,
) {
  switch (source) {
    case "loan":
      return "border-amber-300/25 bg-amber-400/15 text-amber-100";
    case "share":
      return "border-sky-300/25 bg-sky-400/15 text-sky-100";
    case "savings":
    default:
      return "border-emerald-400/25 bg-emerald-500/15 text-emerald-100";
  }
}
