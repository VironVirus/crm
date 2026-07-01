export const SHARE_TRANSACTION_TYPES = [
  "purchase",
  "transfer_in",
  "transfer_out",
] as const;

export const DIVIDEND_DECLARATION_STATUSES = [
  "declared",
  "paid",
] as const;

export type ShareTransactionType = (typeof SHARE_TRANSACTION_TYPES)[number];
export type DividendDeclarationStatus =
  (typeof DIVIDEND_DECLARATION_STATUSES)[number];

export type ShareConfig = {
  shareValue: number;
  minimumShares: number;
  createdAt: string;
};

export type ShareRegisterRow = {
  memberId: string;
  memberName: string;
  memberNumber: string | null;
  memberEmail: string;
  memberPhone: string | null;
  totalShares: number;
  totalValue: number;
  lastUpdated: string;
};

export type ShareMemberOption = {
  id: string;
  fullName: string;
  memberNumber: string | null;
  email: string;
  phone: string | null;
  totalShares: number;
  totalValue: number;
};

export type DividendDeclarationRow = {
  id: string;
  financialYear: string;
  totalProfit: number;
  dividendPerShare: number;
  declarationDate: string;
  paymentDate: string | null;
  status: DividendDeclarationStatus;
  declaredByName: string;
  paymentCount: number;
};

export type ShareRegisterSummary = {
  totalMembersWithShares: number;
  totalSharesOutstanding: number;
  totalShareCapitalValue: number;
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

export function parseSupabaseNumeric(
  value: string | number | null | undefined,
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

export function formatNaira(value: number) {
  return nairaFormatter.format(value);
}

export function formatCompactNaira(value: number) {
  return compactNairaFormatter.format(value);
}

export function formatDisplayDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return dateFormatter.format(date);
}

export function formatShareTransactionTypeLabel(value: ShareTransactionType) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDividendStatusLabel(value: DividendDeclarationStatus) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getDividendStatusTone(status: DividendDeclarationStatus) {
  if (status === "paid") {
    return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  }

  return "border-amber-300/20 bg-amber-400/10 text-amber-100";
}

export function getShareRegisterSummary(
  rows: Array<Pick<ShareRegisterRow, "totalShares" | "totalValue">>,
): ShareRegisterSummary {
  return rows.reduce(
    (summary, row) => {
      if (row.totalShares > 0) {
        summary.totalMembersWithShares += 1;
      }

      summary.totalSharesOutstanding += row.totalShares;
      summary.totalShareCapitalValue += row.totalValue;
      return summary;
    },
    {
      totalMembersWithShares: 0,
      totalSharesOutstanding: 0,
      totalShareCapitalValue: 0,
    },
  );
}
