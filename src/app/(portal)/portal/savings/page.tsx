import { redirect } from "next/navigation";
import MemberSavingsPageView from "@/features/portal/savings/page-view";
import {
  buildSavingsGrowthSeries,
  parseSupabaseNumeric,
  sortSavingsAccountsByType,
  type SavingsAccountOption,
  type SavingsTransactionRow,
} from "@/lib/savings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ProfileRecord = {
  full_name: string;
  member_number: string | null;
};

type SavingsAccountRecord = {
  id: string;
  account_type: SavingsAccountOption["accountType"];
  balance: number | string | null;
  interest_rate: number | string | null;
  maturity_date: string | null;
  status: SavingsAccountOption["status"];
  created_at: string;
};

type SavingsTransactionRecord = {
  id: string;
  savings_account_id: string;
  transaction_type: SavingsTransactionRow["transactionType"];
  amount: number | string | null;
  balance_after: number | string | null;
  payment_reference: string | null;
  narration: string | null;
  transaction_date: string;
  created_by: string;
};

export default async function PortalSavingsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/portal/savings");
  }

  const [profileResult, accountsResult] = await Promise.all([
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
  ]);

  const accountRecords =
    (accountsResult.data as SavingsAccountRecord[] | null) ?? [];
  const accountMap = new Map(
    accountRecords.map((account) => [
      account.id,
      {
        id: account.id,
        accountType: account.account_type,
        balance: parseSupabaseNumeric(account.balance),
        interestRate: parseSupabaseNumeric(account.interest_rate),
        maturityDate: account.maturity_date,
        status: account.status,
        createdAt: account.created_at,
      } satisfies SavingsAccountOption,
    ]),
  );

  const accountIds = Array.from(accountMap.keys());

  let transactionsError: string | null = null;
  let transactionRecords: SavingsTransactionRecord[] = [];

  if (accountIds.length > 0) {
    const transactionsResult = await supabase
      .from("savings_transactions")
      .select(
        "id, savings_account_id, transaction_type, amount, balance_after, payment_reference, narration, transaction_date, created_by",
      )
      .in("savings_account_id", accountIds)
      .order("transaction_date", { ascending: false });

    transactionsError = transactionsResult.error?.message ?? null;
    transactionRecords =
      (transactionsResult.data as SavingsTransactionRecord[] | null) ?? [];
  }

  const accounts = sortSavingsAccountsByType(Array.from(accountMap.values()));
  const transactions = transactionRecords.map((transaction) => ({
    id: transaction.id,
    savingsAccountId: transaction.savings_account_id,
    accountType:
      accountMap.get(transaction.savings_account_id)?.accountType ?? "mandatory",
    transactionType: transaction.transaction_type,
    amount: parseSupabaseNumeric(transaction.amount),
    balanceAfter: parseSupabaseNumeric(transaction.balance_after),
    paymentReference: transaction.payment_reference,
    narration: transaction.narration,
    transactionDate: transaction.transaction_date,
    createdBy: transaction.created_by,
  })) satisfies SavingsTransactionRow[];

  const profile = profileResult.data as ProfileRecord | null;
  const errors = [
    profileResult.error?.message,
    accountsResult.error?.message,
    transactionsError,
  ].filter(Boolean);

  return (
    <MemberSavingsPageView
      accounts={accounts}
      dataError={errors.length > 0 ? errors.join(" ") : null}
      growthSeries={buildSavingsGrowthSeries(accounts, transactions)}
      memberName={profile?.full_name ?? user.email ?? "Member"}
      memberNumber={profile?.member_number ?? null}
      transactions={transactions}
    />
  );
}
