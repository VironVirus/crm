import {
  type DashboardRecentActivityItem,
  parseDashboardNumeric,
  roundDashboardCurrency,
} from "@/lib/dashboard";
import { formatAccountTypeLabel, type SavingsAccountType } from "@/lib/savings";

type DashboardSupabaseClientLike = {
  from: (table: string) => any;
};

type ProfileRecord = {
  full_name: string;
  id: string;
  member_number: string | null;
};

type SavingsTransactionRecord = {
  amount: number | string | null;
  id: string;
  narration: string | null;
  payment_reference: string | null;
  savings_account_id: string;
  transaction_date: string;
  transaction_type: "deposit" | "interest" | "withdrawal";
};

type SavingsAccountRecord = {
  account_type: SavingsAccountType;
  id: string;
  member_id: string;
};

type LoanTransactionRecord = {
  amount: number | string | null;
  id: string;
  loan_id: string;
  payment_reference: string | null;
  transaction_date: string;
  transaction_type: "disbursement" | "penalty" | "repayment";
};

type LoanRecord = {
  id: string;
  member_id: string;
};

type ShareTransactionRecord = {
  amount: number | string | null;
  id: string;
  member_id: string;
  notes: string | null;
  payment_reference: string | null;
  shares_count: number;
  transaction_date: string;
  transaction_type: "purchase" | "transfer_in" | "transfer_out";
};

function formatTitleLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function withReference(baseText: string, paymentReference: string | null) {
  return paymentReference
    ? `${baseText} · Ref ${paymentReference}`
    : baseText;
}

function getSignedAmount({
  amount,
  source,
  transactionType,
}: {
  amount: number;
  source: DashboardRecentActivityItem["source"];
  transactionType: string;
}) {
  if (
    (source === "savings" && transactionType === "withdrawal") ||
    (source === "loans" && transactionType === "disbursement") ||
    (source === "shares" && transactionType === "transfer_out")
  ) {
    return roundDashboardCurrency(amount * -1);
  }

  return roundDashboardCurrency(amount);
}

export async function loadRecentDashboardActivity(
  supabase: DashboardSupabaseClientLike,
) {
  const [
    savingsTransactionsResult,
    loanTransactionsResult,
    shareTransactionsResult,
  ] = await Promise.all([
    supabase
      .from("savings_transactions")
      .select(
        "id, savings_account_id, transaction_type, amount, payment_reference, narration, transaction_date",
      )
      .order("transaction_date", { ascending: false })
      .limit(10),
    supabase
      .from("loan_transactions")
      .select("id, loan_id, transaction_type, amount, payment_reference, transaction_date")
      .order("transaction_date", { ascending: false })
      .limit(10),
    supabase
      .from("share_transactions")
      .select(
        "id, member_id, transaction_type, amount, payment_reference, notes, shares_count, transaction_date",
      )
      .order("transaction_date", { ascending: false })
      .limit(10),
  ]);

  const errors = [
    savingsTransactionsResult.error?.message,
    loanTransactionsResult.error?.message,
    shareTransactionsResult.error?.message,
  ].filter(Boolean);

  const savingsTransactions =
    (savingsTransactionsResult.data as SavingsTransactionRecord[] | null) ?? [];
  const loanTransactions =
    (loanTransactionsResult.data as LoanTransactionRecord[] | null) ?? [];
  const shareTransactions =
    (shareTransactionsResult.data as ShareTransactionRecord[] | null) ?? [];

  const savingsAccountIds = Array.from(
    new Set(savingsTransactions.map((transaction) => transaction.savings_account_id)),
  );
  const loanIds = Array.from(
    new Set(loanTransactions.map((transaction) => transaction.loan_id)),
  );

  const [savingsAccountsResult, loansResult] = await Promise.all([
    savingsAccountIds.length > 0
      ? supabase
          .from("savings_accounts")
          .select("id, member_id, account_type")
          .in("id", savingsAccountIds)
      : Promise.resolve({
          data: [] as SavingsAccountRecord[],
          error: null,
        }),
    loanIds.length > 0
      ? supabase.from("loans").select("id, member_id").in("id", loanIds)
      : Promise.resolve({
          data: [] as LoanRecord[],
          error: null,
        }),
  ]);

  errors.push(savingsAccountsResult.error?.message ?? "");
  errors.push(loansResult.error?.message ?? "");

  const savingsAccounts =
    (savingsAccountsResult.data as SavingsAccountRecord[] | null) ?? [];
  const loans = (loansResult.data as LoanRecord[] | null) ?? [];
  const savingsAccountMap = new Map(
    savingsAccounts.map((account) => [account.id, account] as const),
  );
  const loanMap = new Map(loans.map((loan) => [loan.id, loan] as const));

  const memberIds = new Set<string>();

  savingsAccounts.forEach((account) => {
    memberIds.add(account.member_id);
  });

  loans.forEach((loan) => {
    memberIds.add(loan.member_id);
  });

  shareTransactions.forEach((transaction) => {
    memberIds.add(transaction.member_id);
  });

  const profilesResult =
    memberIds.size > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name, member_number")
          .in("id", Array.from(memberIds))
      : {
          data: [] as ProfileRecord[],
          error: null,
        };

  if (profilesResult.error?.message) {
    errors.push(profilesResult.error.message);
  }

  const profileMap = new Map(
    (((profilesResult.data as ProfileRecord[] | null) ?? []).map((profile) => [
      profile.id,
      profile,
    ])) satisfies Array<[string, ProfileRecord]>,
  );

  const items: DashboardRecentActivityItem[] = [
    ...savingsTransactions.map((transaction) => {
      const account = savingsAccountMap.get(transaction.savings_account_id);
      const profile = account ? profileMap.get(account.member_id) : null;
      const accountLabel = account
        ? `${formatAccountTypeLabel(account.account_type)} account`
        : "Savings account";

      return {
        amount: getSignedAmount({
          amount: parseDashboardNumeric(transaction.amount),
          source: "savings",
          transactionType: transaction.transaction_type,
        }),
        detail: withReference(
          transaction.narration?.trim() || accountLabel,
          transaction.payment_reference,
        ),
        happenedAt: transaction.transaction_date,
        id: `savings:${transaction.id}`,
        memberId: account?.member_id ?? null,
        memberName: profile?.full_name ?? "Member",
        memberNumber: profile?.member_number ?? null,
        paymentReference: transaction.payment_reference,
        source: "savings",
        title: `Savings ${formatTitleLabel(transaction.transaction_type)}`,
      } satisfies DashboardRecentActivityItem;
    }),
    ...loanTransactions.map((transaction) => {
      const loan = loanMap.get(transaction.loan_id);
      const profile = loan ? profileMap.get(loan.member_id) : null;

      return {
        amount: getSignedAmount({
          amount: parseDashboardNumeric(transaction.amount),
          source: "loans",
          transactionType: transaction.transaction_type,
        }),
        detail: withReference("Loan portfolio", transaction.payment_reference),
        happenedAt: transaction.transaction_date,
        id: `loans:${transaction.id}`,
        memberId: loan?.member_id ?? null,
        memberName: profile?.full_name ?? "Member",
        memberNumber: profile?.member_number ?? null,
        paymentReference: transaction.payment_reference,
        source: "loans",
        title: `Loan ${formatTitleLabel(transaction.transaction_type)}`,
      } satisfies DashboardRecentActivityItem;
    }),
    ...shareTransactions.map((transaction) => {
      const profile = profileMap.get(transaction.member_id);

      return {
        amount: getSignedAmount({
          amount: parseDashboardNumeric(transaction.amount),
          source: "shares",
          transactionType: transaction.transaction_type,
        }),
        detail: withReference(
          transaction.notes?.trim() || `${transaction.shares_count} share unit${transaction.shares_count === 1 ? "" : "s"}`,
          transaction.payment_reference,
        ),
        happenedAt: transaction.transaction_date,
        id: `shares:${transaction.id}`,
        memberId: transaction.member_id,
        memberName: profile?.full_name ?? "Member",
        memberNumber: profile?.member_number ?? null,
        paymentReference: transaction.payment_reference,
        source: "shares",
        title: `Share ${formatTitleLabel(transaction.transaction_type)}`,
      } satisfies DashboardRecentActivityItem;
    }),
  ]
    .sort(
      (left, right) =>
        new Date(right.happenedAt).getTime() - new Date(left.happenedAt).getTime(),
    )
    .slice(0, 10);

  return {
    error: errors.filter(Boolean).join(" ") || null,
    items,
  };
}
