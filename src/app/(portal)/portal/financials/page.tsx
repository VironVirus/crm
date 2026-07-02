import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNaira, parseMoney } from "@/lib/loans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  status: "active" | "completed" | "defaulted";
};

type ShareRecord = {
  member_id: string;
  total_value: number | string | null;
};

type CollectionRecord = {
  amount: number | string | null;
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

export default async function PortalFinancialsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/portal/financials");
  }

  const admin = createSupabaseAdminClient();
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
      .select("member_id, outstanding_balance, status")
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

  const accountTotals = new Map<
    string,
    {
      credit: number;
      debit: number;
    }
  >();

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

  const totalsByType = accountRows.reduce(
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

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-border bg-card p-5 shadow-2xl shadow-black/10 dark:shadow-black/30 sm:rounded-[32px] sm:p-6">
        <Badge className="w-fit">Financials</Badge>
        <h2 className="mt-4 font-['Outfit'] text-3xl font-semibold text-foreground">
          Cooperative financial position
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          This view shows the society ledger position, collections, and member-by-member balances for transparency.
        </p>
      </section>

      {dataError ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">
          {dataError}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Total assets</CardTitle>
          </CardHeader>
          <CardContent className="font-['Outfit'] text-3xl font-semibold text-foreground">
            {formatNaira(totalsByType.asset)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Total liabilities</CardTitle>
          </CardHeader>
          <CardContent className="font-['Outfit'] text-3xl font-semibold text-foreground">
            {formatNaira(totalsByType.liability)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Share capital</CardTitle>
          </CardHeader>
          <CardContent className="font-['Outfit'] text-3xl font-semibold text-foreground">
            {formatNaira(memberExposureRows.reduce((total, row) => total + row.shares, 0))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Income recorded</CardTitle>
          </CardHeader>
          <CardContent className="font-['Outfit'] text-3xl font-semibold text-foreground">
            {formatNaira(totalsByType.income)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Expenses recorded</CardTitle>
          </CardHeader>
          <CardContent className="font-['Outfit'] text-3xl font-semibold text-foreground">
            {formatNaira(totalsByType.expense)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Collections this month</CardTitle>
          </CardHeader>
          <CardContent className="font-['Outfit'] text-3xl font-semibold text-foreground">
            {formatNaira(collectionsThisMonth)}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
              Transparency summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
              Cooperative savings balance:{" "}
              <span className="font-medium text-foreground">
                {formatNaira(memberExposureRows.reduce((total, row) => total + row.savings, 0))}
              </span>
            </div>
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
              Loans outstanding across members:{" "}
              <span className="font-medium text-foreground">
                {formatNaira(memberExposureRows.reduce((total, row) => total + row.loans, 0))}
              </span>
            </div>
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
              Donations recorded in the ledger:{" "}
              <span className="font-medium text-foreground">
                {formatNaira(donationTotal)}
              </span>
            </div>
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
              Net position from income and expenses:{" "}
              <span className="font-medium text-foreground">
                {formatNaira(totalsByType.income - totalsByType.expense)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
              Ledger by account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-3xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountRows.map((row) => (
                    <TableRow key={row.accountCode}>
                      <TableCell>{row.accountCode}</TableCell>
                      <TableCell className="text-foreground">{row.accountName}</TableCell>
                      <TableCell className="capitalize">{row.accountType}</TableCell>
                      <TableCell className="text-right font-medium text-foreground">
                        {formatNaira(row.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="font-['Outfit'] text-2xl text-foreground">
            Member-by-member balances
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-3xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead className="text-right">Savings</TableHead>
                  <TableHead className="text-right">Loans</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberExposureRows.map((row) => (
                  <TableRow key={row.memberNumber ?? row.fullName}>
                    <TableCell className="text-foreground">{row.fullName}</TableCell>
                    <TableCell>{row.memberNumber ?? "Pending"}</TableCell>
                    <TableCell className="text-right">{formatNaira(row.savings)}</TableCell>
                    <TableCell className="text-right">{formatNaira(row.loans)}</TableCell>
                    <TableCell className="text-right">{formatNaira(row.shares)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
