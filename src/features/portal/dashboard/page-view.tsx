"use client";

import { type ComponentType } from "react";
import {
  CalendarClock,
  PiggyBank,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/components/theme/theme-provider";
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
  formatCompactNaira,
  formatDisplayDate,
  formatNaira,
} from "@/lib/loans";
import {
  getPortalTransactionLabel,
  getPortalTransactionTone,
  type PortalDashboardActiveLoanSummary,
  type PortalDashboardRecentTransaction,
  type PortalDashboardShareSummary,
} from "@/lib/portal-dashboard";
import { getMemberTierMeta, type MemberTier } from "@/lib/member-tier";
import { type SavingsGrowthPoint } from "@/lib/savings";

type MemberDashboardPageViewProps = {
  activeLoan: PortalDashboardActiveLoanSummary | null;
  dataError?: string | null;
  memberName: string;
  memberNumber: string | null;
  memberTier: MemberTier;
  pendingGuarantorCount: number;
  recentTransactions: PortalDashboardRecentTransaction[];
  savingsBalance: number;
  savingsTrend: SavingsGrowthPoint[];
  shares: PortalDashboardShareSummary;
};

function formatSignedAmount(value: number) {
  return `${value < 0 ? "-" : "+"}${formatNaira(Math.abs(value))}`;
}

function SummaryCard({
  description,
  icon: Icon,
  label,
  tone = "default",
  value,
}: {
  description: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  tone?: "danger" | "default";
  value: string;
}) {
  const danger = tone === "danger";

  return (
    <Card
      className={
        danger
          ? "border-rose-400/25 bg-rose-500/15"
          : "min-w-[228px]"
      }
    >
      <CardHeader className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <Badge className="w-fit" variant={danger ? "outline" : "secondary"}>
            {label}
          </Badge>
          <div
            className={
              danger
                ? "flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-500/15 text-rose-700 dark:text-rose-100"
                : "flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/15 text-emerald-700 dark:text-emerald-100"
            }
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="space-y-1.5">
          <CardTitle className="font-['Outfit'] text-base text-foreground sm:text-2xl">
            {value}
          </CardTitle>
          <CardDescription
            className={
              danger
                ? "text-rose-700 dark:text-rose-100/85"
                : "text-[11px] leading-5 sm:text-sm"
            }
          >
            {description}
          </CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}

export default function MemberDashboardPageView({
  activeLoan,
  dataError,
  memberName,
  memberNumber,
  memberTier,
  pendingGuarantorCount,
  recentTransactions,
  savingsBalance,
  savingsTrend,
  shares,
}: MemberDashboardPageViewProps) {
  const tierMeta = getMemberTierMeta(memberTier);
  const { resolvedTheme } = useTheme();
  const chartGrid = resolvedTheme === "dark"
    ? "rgba(255,255,255,0.12)"
    : "rgba(15,23,42,0.12)";
  const chartTick = resolvedTheme === "dark" ? "#cbd5e1" : "#475569";
  const tooltipBackground =
    resolvedTheme === "dark" ? "rgba(17, 24, 39, 0.98)" : "#ffffff";
  const tooltipBorder =
    resolvedTheme === "dark"
      ? "1px solid rgba(255,255,255,0.16)"
      : "1px solid rgba(15,23,42,0.12)";

  return (
    <div className="space-y-6">
      {dataError ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/15 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">
          {dataError}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-border bg-card px-4 py-5 shadow-xl shadow-black/10 dark:shadow-black/30 sm:rounded-[28px] sm:px-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <Badge className="w-fit">{tierMeta.label}</Badge>
            <h2 className="font-['Outfit'] text-xl font-semibold text-foreground sm:text-3xl">
              Welcome, {memberName}
            </h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {memberNumber ?? "Member number pending"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {memberTier !== "tier_3" ? (
              <Badge className="border-amber-300/30 bg-amber-400/10 text-amber-800 dark:text-amber-100" variant="outline">
                {tierMeta.nextStep}
              </Badge>
            ) : null}
            {pendingGuarantorCount > 0 ? (
              <Badge className="border-rose-300/30 bg-rose-500/10 text-rose-700 dark:text-rose-100" variant="outline">
                {pendingGuarantorCount} pending guarantor request{pendingGuarantorCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {memberTier === "tier_3" && pendingGuarantorCount === 0 ? (
              <Badge variant="secondary">All clear</Badge>
            ) : null}
          </div>
        </div>
      </section>

      <section className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        <div className="grid auto-cols-[86%] grid-flow-col gap-4 sm:auto-cols-[280px] md:grid-flow-row md:auto-cols-auto md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            description="Mandatory and voluntary balances together."
            icon={PiggyBank}
            label="Savings balance"
            value={formatNaira(savingsBalance)}
          />
          <SummaryCard
            description={
              memberTier !== "tier_3"
                ? "Complete your profile to unlock loans."
                : activeLoan?.nextRepaymentDate
                  ? `Next: ${formatDisplayDate(activeLoan.nextRepaymentDate)} · ${formatNaira(activeLoan.nextRepaymentAmount)}`
                  : "No active repayment schedule."
            }
            icon={CalendarClock}
            label="Active loan"
            value={
              memberTier !== "tier_3"
                ? "Tier 3"
                : activeLoan
                  ? formatNaira(activeLoan.outstandingBalance)
                  : "None"
            }
          />
          <SummaryCard
            description={
              memberTier !== "tier_3"
                ? "Share access becomes available at Tier 3."
                : `${shares.totalShares.toLocaleString("en-NG")} share unit${
                    shares.totalShares === 1 ? "" : "s"
                  } held.`
            }
            icon={TrendingUp}
            label="Shares held"
            value={memberTier !== "tier_3" ? "Tier 3" : formatNaira(shares.totalValue)}
          />
          <SummaryCard
            description="Requests waiting for your response."
            icon={ShieldCheck}
            label="Guarantor requests"
            tone={pendingGuarantorCount > 0 ? "danger" : "default"}
            value={pendingGuarantorCount.toLocaleString("en-NG")}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <Badge className="w-fit">Savings Trend</Badge>
            <CardTitle className="font-['Outfit'] text-xl text-foreground sm:text-2xl">
              Savings balance over 12 months
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] sm:h-[320px]">
              <ResponsiveContainer height="100%" width="100%">
                <LineChart data={savingsTrend}>
                  <CartesianGrid stroke={chartGrid} vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="label"
                    tick={{ fill: chartTick, fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    tick={{ fill: chartTick, fontSize: 12 }}
                    tickFormatter={(value) => formatCompactNaira(Number(value))}
                    tickLine={false}
                    width={92}
                  />
                  <Tooltip
                    contentStyle={{
                      background: tooltipBackground,
                      border: tooltipBorder,
                      borderRadius: "18px",
                      color: chartTick,
                    }}
                    formatter={(value) => formatNaira(Number(value))}
                    labelStyle={{ color: chartTick }}
                  />
                  <Line
                    activeDot={{ r: 6 }}
                    dataKey="balance"
                    dot={{ fill: "#34d399", r: 4, strokeWidth: 0 }}
                    stroke="#34d399"
                    strokeWidth={3}
                    type="monotone"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Badge className="w-fit" variant="secondary">
              Loan Progress
            </Badge>
            <CardTitle className="font-['Outfit'] text-xl text-foreground sm:text-2xl">
              Repayment progress
            </CardTitle>
            <CardDescription>
              {activeLoan?.productName ?? "No active loan currently selected."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {activeLoan ? (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground sm:text-sm">
                    <span>{activeLoan.progressPercent}% repaid</span>
                    <span>
                      {formatNaira(activeLoan.totalRepaid)} of{" "}
                      {formatNaira(activeLoan.totalRepayable)}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-400"
                      style={{ width: `${activeLoan.progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-3 md:hidden">
                  {activeLoan.upcomingInstallments.length > 0 ? (
                    activeLoan.upcomingInstallments.map((installment) => (
                      <div
                        key={installment.id}
                        className="rounded-2xl border border-border bg-secondary px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">
                            {formatDisplayDate(installment.dueDate)}
                          </p>
                          <Badge
                            className={
                              installment.status === "overdue"
                                ? "border-rose-400/25 bg-rose-500/15 text-rose-700 dark:text-rose-100"
                                : undefined
                            }
                            variant={
                              installment.status === "overdue"
                                ? "outline"
                                : "secondary"
                            }
                          >
                            {installment.status}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {formatNaira(installment.totalDue)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-3xl border border-dashed border-border bg-secondary px-4 py-6 text-center text-sm text-muted-foreground">
                      No upcoming installments are scheduled.
                    </div>
                  )}
                </div>

                <div className="hidden rounded-3xl border border-border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Due date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeLoan.upcomingInstallments.length > 0 ? (
                        activeLoan.upcomingInstallments.map((installment) => (
                          <TableRow key={installment.id}>
                            <TableCell>
                              {formatDisplayDate(installment.dueDate)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatNaira(installment.totalDue)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  installment.status === "overdue"
                                    ? "border-rose-400/25 bg-rose-500/15 text-rose-700 dark:text-rose-100"
                                    : undefined
                                }
                                variant={
                                  installment.status === "overdue"
                                    ? "outline"
                                    : "secondary"
                                }
                              >
                                {installment.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell className="text-muted-foreground" colSpan={3}>
                            No upcoming installments are scheduled.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="rounded-3xl border border-dashed border-border bg-secondary px-4 py-10 text-center text-sm text-muted-foreground">
                No active loan is currently on your profile.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <Badge className="w-fit" variant="secondary">
              Recent Transactions
            </Badge>
            <CardTitle className="font-['Outfit'] text-xl text-foreground sm:text-2xl">
              Latest account activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 md:hidden">
              {recentTransactions.length > 0 ? (
                recentTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="rounded-2xl border border-border bg-secondary px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <Badge
                          className={getPortalTransactionTone(transaction.source)}
                          variant="outline"
                        >
                          {getPortalTransactionLabel(transaction.source)}
                        </Badge>
                        <p className="text-sm text-foreground">{transaction.detail}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDisplayDate(transaction.date)}
                        </p>
                      </div>
                      <p
                        className={
                          transaction.amount < 0
                            ? "text-sm font-medium text-rose-700 dark:text-rose-200"
                            : "text-sm font-medium text-emerald-700 dark:text-emerald-200"
                        }
                      >
                        {formatSignedAmount(transaction.amount)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-border bg-secondary px-4 py-6 text-center text-sm text-muted-foreground">
                  No transactions posted yet.
                </div>
              )}
            </div>

            <div className="hidden rounded-3xl border border-border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTransactions.length > 0 ? (
                    recentTransactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          <Badge
                            className={getPortalTransactionTone(
                              transaction.source,
                            )}
                            variant="outline"
                          >
                            {getPortalTransactionLabel(transaction.source)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-foreground">
                          {transaction.detail}
                        </TableCell>
                        <TableCell
                          className={
                            transaction.amount < 0
                              ? "text-right font-medium text-rose-700 dark:text-rose-200"
                              : "text-right font-medium text-emerald-700 dark:text-emerald-200"
                          }
                        >
                          {formatSignedAmount(transaction.amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDisplayDate(transaction.date)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={4}>
                        No transactions posted yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

    </div>
  );
}
