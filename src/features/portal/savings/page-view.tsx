"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, ArrowRight, Landmark, PiggyBank, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatAccountTypeLabel,
  formatCompactNaira,
  formatDisplayDate,
  formatNaira,
  formatTransactionTypeLabel,
  getSavingsSummary,
  getTotalSavingsBalance,
  type SavingsAccountOption,
  type SavingsGrowthPoint,
  type SavingsTransactionRow,
} from "@/lib/savings";

const TRANSACTIONS_PER_PAGE = 10;

function getTransactionBadgeClasses(type: SavingsTransactionRow["transactionType"]) {
  if (type === "withdrawal") {
    return "border-rose-400/20 bg-rose-500/10 text-rose-100";
  }

  if (type === "interest") {
    return "border-amber-300/20 bg-amber-400/10 text-amber-100";
  }

  return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
}

export default function MemberSavingsPageView({
  accounts,
  dataError,
  growthSeries,
  memberName,
  memberNumber,
  transactions,
}: {
  accounts: SavingsAccountOption[];
  dataError?: string | null;
  growthSeries: SavingsGrowthPoint[];
  memberName: string;
  memberNumber: string | null;
  transactions: SavingsTransactionRow[];
}) {
  const [page, setPage] = useState(1);

  const summary = useMemo(() => getSavingsSummary(accounts), [accounts]);
  const totalSavingsBalance = useMemo(
    () => getTotalSavingsBalance(accounts),
    [accounts],
  );

  const pageCount = Math.max(1, Math.ceil(transactions.length / TRANSACTIONS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * TRANSACTIONS_PER_PAGE;

  const paginatedTransactions = useMemo(
    () => transactions.slice(pageStart, pageStart + TRANSACTIONS_PER_PAGE),
    [pageStart, transactions],
  );

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-[24px] border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/20 lg:flex-row lg:items-end lg:justify-between sm:rounded-[30px] sm:p-5">
        <div className="space-y-2">
          <Badge className="w-fit">Savings Overview</Badge>
          <div className="space-y-1.5">
            <h2 className="font-['Outfit'] text-2xl font-semibold text-white sm:text-[2rem]">
              Your savings position
            </h2>
            <p className="max-w-2xl text-xs leading-5 text-slate-300 sm:text-sm sm:leading-6">
              {memberName}
              {memberNumber ? ` · ${memberNumber}` : ""}. Review your balance
              across savings types, track recent transactions, and watch your
              savings growth over the last twelve months.
            </p>
          </div>
        </div>

        <div className="rounded-[22px] border border-emerald-400/15 bg-emerald-500/10 px-4 py-3.5 sm:px-5 sm:py-4">
          <p className="text-xs uppercase tracking-[0.28em] text-emerald-200">
            Total balance
          </p>
          <p className="mt-1.5 font-['Outfit'] text-2xl font-semibold text-white sm:text-3xl">
            {formatNaira(totalSavingsBalance)}
          </p>
          <p className="mt-1 text-xs text-slate-300 sm:text-sm">
            Across {accounts.length} active savings account
            {accounts.length === 1 ? "" : "s"}
          </p>
        </div>
      </section>

      {dataError ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 sm:text-sm">
          {dataError}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-white/[0.06]">
          <CardHeader className="p-4">
            <div className="flex items-center justify-between gap-3">
              <Badge className="w-fit">Mandatory</Badge>
              <PiggyBank className="h-5 w-5 text-emerald-200" />
            </div>
            <CardTitle className="font-['Outfit'] text-2xl">
              {formatNaira(summary.mandatory)}
            </CardTitle>
            <CardDescription className="text-xs leading-5 sm:text-sm">
              Contributions that strengthen your long-term eligibility.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-white/[0.06]">
          <CardHeader className="p-4">
            <div className="flex items-center justify-between gap-3">
              <Badge className="w-fit" variant="secondary">
                Voluntary
              </Badge>
              <Wallet className="h-5 w-5 text-sky-200" />
            </div>
            <CardTitle className="font-['Outfit'] text-2xl">
              {formatNaira(summary.voluntary)}
            </CardTitle>
            <CardDescription className="text-xs leading-5 sm:text-sm">
              Flexible savings you can build on over time.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-white/[0.06]">
          <CardHeader className="p-4">
            <div className="flex items-center justify-between gap-3">
              <Badge className="w-fit" variant="outline">
                Fixed deposit
              </Badge>
              <Landmark className="h-5 w-5 text-amber-200" />
            </div>
            <CardTitle className="font-['Outfit'] text-2xl">
              {formatNaira(summary.fixed_deposit)}
            </CardTitle>
            <CardDescription className="text-xs leading-5 sm:text-sm">
              Locked funds growing toward their maturity date.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-white/[0.06]">
          <CardHeader className="p-4">
            <Badge className="w-fit" variant="secondary">
              Recent activity
            </Badge>
            <CardTitle className="font-['Outfit'] text-2xl">
              {transactions.length > 0
                ? formatDisplayDate(transactions[0].transactionDate)
                : "No activity"}
            </CardTitle>
            <CardDescription className="text-xs leading-5 sm:text-sm">
              Latest transaction date recorded on your savings profile.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="bg-white/[0.04]">
          <CardHeader className="p-4 pb-3">
            <Badge className="w-fit">12-month trend</Badge>
            <CardTitle className="font-['Outfit'] text-xl sm:text-2xl">
              Savings growth over time
            </CardTitle>
            <CardDescription className="text-xs leading-5 sm:text-sm">
              Your total savings balance across all savings types for the last
              twelve months.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="h-[260px] sm:h-[300px]">
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart data={growthSeries}>
                  <defs>
                    <linearGradient id="growthFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="label"
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                    tickFormatter={(value) => formatCompactNaira(Number(value))}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(2, 6, 23, 0.92)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "18px",
                    }}
                    formatter={(value) => formatNaira(Number(value))}
                    labelStyle={{ color: "#cbd5e1" }}
                  />
                  <Area
                    dataKey="balance"
                    fill="url(#growthFill)"
                    fillOpacity={1}
                    stroke="#34d399"
                    strokeWidth={3}
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.04]">
          <CardHeader className="p-4 pb-3">
            <Badge className="w-fit" variant="secondary">
              Account breakdown
            </Badge>
            <CardTitle className="font-['Outfit'] text-xl sm:text-2xl">
              Your savings accounts
            </CardTitle>
            <CardDescription className="text-xs leading-5 sm:text-sm">
              A quick look at each active savings account attached to your profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 p-4 pt-0">
            {accounts.length > 0 ? (
              accounts.map((account) => (
                <div
                  key={account.id}
                  className="rounded-[20px] border border-white/10 bg-slate-950/40 px-3.5 py-3.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Badge
                      variant={
                        account.accountType === "fixed_deposit"
                          ? "outline"
                          : account.accountType === "voluntary"
                            ? "secondary"
                            : "default"
                      }
                    >
                      {formatAccountTypeLabel(account.accountType)}
                    </Badge>
                    <span className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      {account.status}
                    </span>
                  </div>
                  <p className="mt-2.5 font-['Outfit'] text-xl font-semibold text-white sm:text-2xl">
                    {formatNaira(account.balance)}
                  </p>
                  <div className="mt-2.5 grid gap-1.5 text-xs text-slate-300 sm:text-sm">
                    <p>Interest rate: {account.interestRate.toFixed(2)}%</p>
                    <p>
                      Maturity:{" "}
                      {account.accountType === "fixed_deposit"
                        ? formatDisplayDate(account.maturityDate)
                        : "Not applicable"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-xs text-slate-400 sm:text-sm">
                No savings accounts have been opened on your profile yet.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="bg-white/[0.04]">
        <CardHeader className="gap-3 border-b border-white/10 p-4">
          <Badge className="w-fit">Transaction history</Badge>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="font-['Outfit'] text-xl sm:text-2xl">
                Posted savings transactions
              </CardTitle>
              <CardDescription className="text-xs leading-5 sm:text-sm">
                Page {currentPage} of {pageCount} · {transactions.length} total
                transaction{transactions.length === 1 ? "" : "s"}
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                disabled={currentPage === 1}
                onClick={() => setPage((previousPage) => Math.max(1, previousPage - 1))}
                size="sm"
                variant="secondary"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>
              <Button
                disabled={currentPage === pageCount}
                onClick={() =>
                  setPage((previousPage) => Math.min(pageCount, previousPage + 1))
                }
                size="sm"
                variant="secondary"
              >
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-10 px-3 text-xs">Date</TableHead>
                <TableHead className="h-10 px-3 text-xs">Type</TableHead>
                <TableHead className="h-10 px-3 text-xs">Account</TableHead>
                <TableHead className="h-10 px-3 text-xs">Amount</TableHead>
                <TableHead className="h-10 px-3 text-xs">Balance After</TableHead>
                <TableHead className="h-10 px-3 text-xs">Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedTransactions.length > 0 ? (
                paginatedTransactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="px-3 py-2.5 text-sm">
                      {formatDisplayDate(transaction.transactionDate)}
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${getTransactionBadgeClasses(transaction.transactionType)}`}
                      >
                        {formatTransactionTypeLabel(transaction.transactionType)}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-sm">
                      {formatAccountTypeLabel(transaction.accountType)}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-sm font-medium text-white">
                      {formatNaira(transaction.amount)}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-sm">
                      {formatNaira(transaction.balanceAfter)}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-sm">
                      <div className="space-y-0.5">
                        <p>{transaction.paymentReference ?? "No reference"}</p>
                        <p className="text-[11px] text-slate-400">
                          {transaction.narration ?? "No narration"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="px-3 py-8 text-center text-xs text-slate-400 sm:text-sm"
                    colSpan={6}
                  >
                    No savings transactions have been posted yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
