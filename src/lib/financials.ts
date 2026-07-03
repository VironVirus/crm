import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseMoney } from "@/lib/loans";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type AccountRecord = {
  account_code: string;
  account_name: string;
  account_type: "asset" | "equity" | "expense" | "income" | "liability";
  id: string;
};

type JournalEntryRecord = {
  id: string;
};

type JournalLineRecord = {
  account_id: string;
  credit_amount: number | string | null;
  debit_amount: number | string | null;
};

type ProfileRecord = {
  full_name: string;
  id: string;
  member_number: string | null;
};

type SavingsRecord = {
  balance: number | string | null;
  member_id: string;
};

type LoanRecord = {
  member_id: string;
  outstanding_balance: number | string | null;
};

type ShareRecord = {
  member_id: string;
  total_value: number | string | null;
};

type CollectionRecord = {
  amount: number | string | null;
};

type AccountTypeTotals = {
  asset: number;
  equity: number;
  expense: number;
  income: number;
  liability: number;
};

export type FinancialAccountRow = {
  accountCode: string;
  accountName: string;
  accountType: AccountRecord["account_type"];
  balance: number;
  credit: number;
  debit: number;
};

export type FinancialMemberExposureRow = {
  fullName: string;
  loans: number;
  memberNumber: string | null;
  savings: number;
  shares: number;
};

export type PortalFinancialRecordsData = {
  accountRows: FinancialAccountRow[];
  collectionsThisMonth: number;
  dataError: string;
  donationTotal: number;
  memberExposureRows: FinancialMemberExposureRow[];
  totalsByType: AccountTypeTotals;
};

function monthStartIso() {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function getNormalBalance({
  accountType,
  credit,
  debit,
}: {
  accountType: AccountRecord["account_type"];
  credit: number;
  debit: number;
}) {
  if (accountType === "asset" || accountType === "expense") {
    return debit - credit;
  }

  return credit - debit;
}

export async function getPortalFinancialRecordsData(
  admin: AdminClient = createSupabaseAdminClient(),
): Promise<PortalFinancialRecordsData> {
  const currentMonthStart = monthStartIso();

  const [
    profilesResult,
    accountsResult,
    postedEntriesResult,
    savingsResult,
    loansResult,
    sharesResult,
    savingsCollectionsResult,
    loanCollectionsResult,
    shareCollectionsResult,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, member_number")
      .not("member_number", "is", null)
      .order("full_name"),
    admin
      .from("accounts")
      .select("id, account_code, account_name, account_type")
      .order("account_code"),
    admin.from("journal_entries").select("id").eq("status", "posted"),
    admin.from("savings_accounts").select("member_id, balance").eq("status", "active"),
    admin
      .from("loans")
      .select("member_id, outstanding_balance")
      .in("status", ["active", "defaulted"]),
    admin.from("member_shares").select("member_id, total_value"),
    admin
      .from("savings_transactions")
      .select("amount")
      .eq("transaction_type", "deposit")
      .gte("transaction_date", currentMonthStart),
    admin
      .from("loan_transactions")
      .select("amount")
      .eq("transaction_type", "repayment")
      .gte("transaction_date", currentMonthStart),
    admin
      .from("share_transactions")
      .select("amount")
      .eq("transaction_type", "purchase")
      .gte("transaction_date", currentMonthStart),
  ]);

  const postedEntryIds = ((postedEntriesResult.data as JournalEntryRecord[] | null) ?? []).map(
    (entry) => entry.id,
  );
  const journalLinesResult =
    postedEntryIds.length > 0
      ? await admin
          .from("journal_lines")
          .select("account_id, debit_amount, credit_amount")
          .in("journal_entry_id", postedEntryIds)
      : { data: [] as JournalLineRecord[], error: null };

  const profiles = (profilesResult.data as ProfileRecord[] | null) ?? [];
  const accounts = (accountsResult.data as AccountRecord[] | null) ?? [];
  const journalLines = (journalLinesResult.data as JournalLineRecord[] | null) ?? [];
  const savingsRows = (savingsResult.data as SavingsRecord[] | null) ?? [];
  const loanRows = (loansResult.data as LoanRecord[] | null) ?? [];
  const shareRows = (sharesResult.data as ShareRecord[] | null) ?? [];

  const accountTotals = new Map<string, { credit: number; debit: number }>();

  journalLines.forEach((line) => {
    const current = accountTotals.get(line.account_id) ?? { credit: 0, debit: 0 };
    current.credit += parseMoney(line.credit_amount);
    current.debit += parseMoney(line.debit_amount);
    accountTotals.set(line.account_id, current);
  });

  const accountRows = accounts.map((account) => {
    const totals = accountTotals.get(account.id) ?? { credit: 0, debit: 0 };

    return {
      accountCode: account.account_code,
      accountName: account.account_name,
      accountType: account.account_type,
      balance: getNormalBalance({
        accountType: account.account_type,
        credit: totals.credit,
        debit: totals.debit,
      }),
      credit: totals.credit,
      debit: totals.debit,
    };
  });

  const totalsByType = accountRows.reduce<AccountTypeTotals>(
    (accumulator, row) => {
      accumulator[row.accountType] += row.balance;
      return accumulator;
    },
    {
      asset: 0,
      equity: 0,
      expense: 0,
      income: 0,
      liability: 0,
    },
  );

  const donationTotal = accountRows.reduce((total, row) => {
    const normalizedName = row.accountName.toLowerCase();

    if (
      normalizedName.includes("donation") ||
      normalizedName.includes("grant")
    ) {
      return total + row.balance;
    }

    return total;
  }, 0);

  const savingsByMember = new Map<string, number>();
  savingsRows.forEach((row) => {
    savingsByMember.set(
      row.member_id,
      (savingsByMember.get(row.member_id) ?? 0) + parseMoney(row.balance),
    );
  });

  const loansByMember = new Map<string, number>();
  loanRows.forEach((row) => {
    loansByMember.set(
      row.member_id,
      (loansByMember.get(row.member_id) ?? 0) +
        parseMoney(row.outstanding_balance),
    );
  });

  const sharesByMember = new Map<string, number>();
  shareRows.forEach((row) => {
    sharesByMember.set(row.member_id, parseMoney(row.total_value));
  });

  const memberExposureRows = profiles.map((profile) => ({
    fullName: profile.full_name,
    loans: loansByMember.get(profile.id) ?? 0,
    memberNumber: profile.member_number,
    savings: savingsByMember.get(profile.id) ?? 0,
    shares: sharesByMember.get(profile.id) ?? 0,
  }));

  const collectionsThisMonth = [
    ...(((savingsCollectionsResult.data as CollectionRecord[] | null) ?? []).map((row) =>
      parseMoney(row.amount),
    )),
    ...(((loanCollectionsResult.data as CollectionRecord[] | null) ?? []).map((row) =>
      parseMoney(row.amount),
    )),
    ...(((shareCollectionsResult.data as CollectionRecord[] | null) ?? []).map((row) =>
      parseMoney(row.amount),
    )),
  ].reduce((total, value) => total + value, 0);

  const dataError = [
    profilesResult.error?.message,
    accountsResult.error?.message,
    postedEntriesResult.error?.message,
    journalLinesResult.error?.message,
    savingsResult.error?.message,
    loansResult.error?.message,
    sharesResult.error?.message,
    savingsCollectionsResult.error?.message,
    loanCollectionsResult.error?.message,
    shareCollectionsResult.error?.message,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    accountRows,
    collectionsThisMonth,
    dataError,
    donationTotal,
    memberExposureRows,
    totalsByType,
  };
}
