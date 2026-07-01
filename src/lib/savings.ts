export const SAVINGS_ACCOUNT_TYPES = [
  "mandatory",
  "voluntary",
  "fixed_deposit",
] as const;

export const SAVINGS_TRANSACTION_TYPES = [
  "deposit",
  "withdrawal",
  "interest",
] as const;

export type SavingsAccountType = (typeof SAVINGS_ACCOUNT_TYPES)[number];
export type SavingsTransactionType = (typeof SAVINGS_TRANSACTION_TYPES)[number];

export type SavingsSummary = Record<SavingsAccountType, number>;

export type SavingsAccountRow = {
  id: string;
  memberId: string;
  memberName: string;
  memberNumber: string | null;
  memberEmail: string;
  memberPhone: string | null;
  accountType: SavingsAccountType;
  balance: number;
  interestRate: number;
  maturityDate: string | null;
  status: "active" | "closed";
  createdAt: string;
};

export type SavingsAccountOption = {
  id: string;
  accountType: SavingsAccountType;
  balance: number;
  interestRate: number;
  maturityDate: string | null;
  status: "active" | "closed";
  createdAt: string;
};

export type SavingsMemberOption = {
  id: string;
  fullName: string;
  memberNumber: string | null;
  email: string;
  phone: string | null;
  accounts: SavingsAccountOption[];
};

export type SavingsTransactionRow = {
  id: string;
  savingsAccountId: string;
  accountType: SavingsAccountType;
  transactionType: SavingsTransactionType;
  amount: number;
  balanceAfter: number;
  paymentReference: string | null;
  narration: string | null;
  transactionDate: string;
  createdBy: string;
};

export type SavingsGrowthPoint = {
  month: string;
  label: string;
  balance: number;
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

export function formatAccountTypeLabel(value: SavingsAccountType) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatTransactionTypeLabel(value: SavingsTransactionType) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getSavingsSummary(accounts: Array<Pick<SavingsAccountRow, "accountType" | "balance">>) {
  return accounts.reduce<SavingsSummary>(
    (totals, account) => {
      totals[account.accountType] += account.balance;
      return totals;
    },
    {
      mandatory: 0,
      voluntary: 0,
      fixed_deposit: 0,
    },
  );
}

export function getTotalSavingsBalance(accounts: Array<Pick<SavingsAccountRow, "balance">>) {
  return accounts.reduce((total, account) => total + account.balance, 0);
}

export function parseSupabaseNumeric(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function sortSavingsAccountsByType(accounts: SavingsAccountOption[]) {
  const rank: Record<SavingsAccountType, number> = {
    mandatory: 0,
    voluntary: 1,
    fixed_deposit: 2,
  };

  return [...accounts].sort((left, right) => rank[left.accountType] - rank[right.accountType]);
}

export function buildSavingsGrowthSeries(
  accounts: Array<Pick<SavingsAccountRow, "balance">>,
  transactions: Array<Pick<SavingsTransactionRow, "transactionType" | "amount" | "transactionDate">>,
  months = 12,
) {
  const currentTotal = getTotalSavingsBalance(accounts);
  const now = new Date();
  const monthStarts: Date[] = [];

  for (let index = months - 1; index >= 0; index -= 1) {
    monthStarts.push(new Date(now.getFullYear(), now.getMonth() - index, 1));
  }

  const monthlyNet = new Map<string, number>();

  transactions.forEach((transaction) => {
    const transactionDate = new Date(transaction.transactionDate);

    if (Number.isNaN(transactionDate.getTime())) {
      return;
    }

    const key = `${transactionDate.getFullYear()}-${String(
      transactionDate.getMonth() + 1,
    ).padStart(2, "0")}`;

    const direction =
      transaction.transactionType === "withdrawal"
        ? -transaction.amount
        : transaction.amount;

    monthlyNet.set(key, (monthlyNet.get(key) ?? 0) + direction);
  });

  const points: SavingsGrowthPoint[] = [];
  let rollingBalance = currentTotal;

  for (let index = monthStarts.length - 1; index >= 0; index -= 1) {
    const monthDate = monthStarts[index];
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;

    points.unshift({
      month: key,
      label: monthFormatter.format(monthDate),
      balance: rollingBalance,
    });

    rollingBalance -= monthlyNet.get(key) ?? 0;
  }

  return points;
}
