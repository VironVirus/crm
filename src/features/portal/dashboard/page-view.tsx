"use client";

import Link from "next/link";
import { type ComponentType, useState } from "react";
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  Download,
  Landmark,
  Loader2,
  PiggyBank,
  ShieldCheck,
  TrendingUp,
  Wallet,
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
import { Button } from "@/components/ui/button";
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
import {
  type MemberPaymentLoanOption,
  type MemberPaymentShareConfig,
} from "@/lib/payments";
import { MakePaymentDialog } from "@/features/portal/dashboard/make-payment-dialog";

type MemberDashboardPageViewProps = {
  activeLoan: PortalDashboardActiveLoanSummary | null;
  dataError?: string | null;
  memberId: string;
  memberName: string;
  memberNumber: string | null;
  memberTier: MemberTier;
  paymentLoanOptions: MemberPaymentLoanOption[];
  pendingGuarantorCount: number;
  profileCompletion: {
    kycComplete: boolean;
    nextOfKinComplete: boolean;
  };
  recentTransactions: PortalDashboardRecentTransaction[];
  savingsBalance: number;
  savingsTrend: SavingsGrowthPoint[];
  shareConfig: MemberPaymentShareConfig | null;
  shares: PortalDashboardShareSummary;
};

function formatSignedAmount(value: number) {
  return `${value < 0 ? "-" : "+"}${formatNaira(Math.abs(value))}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
          : ""
      }
    >
      <CardHeader className="space-y-4 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <Badge className="w-fit" variant={danger ? "outline" : "secondary"}>
            {label}
          </Badge>
          <div
            className={
              danger
                ? "flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-500/15 text-rose-100"
                : "flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/15 text-emerald-100"
            }
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="space-y-2">
          <CardTitle className="font-['Outfit'] text-2xl text-foreground sm:text-3xl">
            {value}
          </CardTitle>
          <CardDescription
            className={danger ? "text-rose-700 dark:text-rose-100/85" : ""}
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
  memberId,
  memberName,
  memberNumber,
  memberTier,
  paymentLoanOptions,
  pendingGuarantorCount,
  profileCompletion,
  recentTransactions,
  savingsBalance,
  savingsTrend,
  shareConfig,
  shares,
}: MemberDashboardPageViewProps) {
  const [statementError, setStatementError] = useState<string | null>(null);
  const [isGeneratingStatement, setIsGeneratingStatement] = useState(false);
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

  async function handleStatementDownload() {
    setStatementError(null);
    setIsGeneratingStatement(true);

    try {
      const response = await fetch("/api/portal/reports/member-statement");

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;

        throw new Error(
          payload?.message ?? "Unable to generate your statement right now.",
        );
      }

      const filename =
        response.headers
          .get("content-disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ??
        `ifemelunma-member-statement-${new Date().toISOString().slice(0, 10)}.pdf`;
      const blob = await response.blob();

      downloadBlob(blob, filename);
    } catch (error) {
      setStatementError(
        error instanceof Error
          ? error.message
          : "Unable to generate your statement right now.",
      );
    } finally {
      setIsGeneratingStatement(false);
    }
  }

  return (
    <div className="space-y-6">
      {dataError ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
          {dataError}
        </div>
      ) : null}

      {statementError ? (
        <div className="rounded-2xl border border-rose-400/25 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
          {statementError}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-border bg-card px-4 py-5 shadow-xl shadow-black/10 dark:shadow-black/30 sm:rounded-[28px] sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Badge className="w-fit">{tierMeta.label}</Badge>
            <h2 className="font-['Outfit'] text-3xl font-semibold text-foreground">
              Welcome, {memberName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {memberNumber ?? "Member number pending"}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap">
            <MakePaymentDialog
              activeLoans={paymentLoanOptions}
              memberId={memberId}
              memberName={memberName}
              memberNumber={memberNumber}
              memberTier={memberTier}
              shareConfig={shareConfig}
            />
            <Button asChild variant="secondary">
              <Link href={memberTier === "tier_3" ? "/portal/loans" : "/portal/profile"}>
                <Landmark className="mr-2 h-4 w-4" />
                {memberTier === "tier_3" ? "Apply for Loan" : "Complete Profile"}
              </Link>
            </Button>
            <Button
              disabled={isGeneratingStatement}
              onClick={handleStatementDownload}
              variant="secondary"
            >
              {isGeneratingStatement ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              View Statement
            </Button>
            <Button asChild variant="secondary">
              <Link href="/portal/notifications">
                <BellRing className="mr-2 h-4 w-4" />
                View Notifications
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {memberTier !== "tier_3" ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-400/10 px-4 py-5 shadow-xl shadow-black/10 dark:shadow-black/20 sm:rounded-[28px] sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.24em] text-amber-700 dark:text-amber-200">
                Membership progress
              </p>
              <h3 className="font-['Outfit'] text-2xl font-semibold text-foreground">
                {tierMeta.nextStep}
              </h3>
              <p className="text-sm text-amber-800 dark:text-amber-100/90">
                Next of kin completed: {profileCompletion.nextOfKinComplete ? "Yes" : "No"}.
                KYC completed: {profileCompletion.kycComplete ? "Yes" : "No"}.
              </p>
            </div>
            <Button asChild>
              <Link href="/portal/profile">Open Profile</Link>
            </Button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          description="Mandatory and voluntary savings combined."
          icon={PiggyBank}
          label="Savings balance"
          value={formatNaira(savingsBalance)}
        />
        <SummaryCard
          description={
            memberTier !== "tier_3"
              ? "Loans unlock when you complete next of kin and KYC."
              : activeLoan?.nextRepaymentDate
              ? `Next: ${formatDisplayDate(activeLoan.nextRepaymentDate)} · ${formatNaira(activeLoan.nextRepaymentAmount)}`
              : "No active repayment schedule available."
          }
          icon={CalendarClock}
          label="Active loan"
          value={
            memberTier !== "tier_3"
              ? "Locked"
              : activeLoan
                ? formatNaira(activeLoan.outstandingBalance)
                : "None"
          }
        />
        <SummaryCard
          description={
            memberTier !== "tier_3"
              ? "Share access unlocks at Tier 3."
              : `${shares.totalShares.toLocaleString("en-NG")} share unit${
                  shares.totalShares === 1 ? "" : "s"
                } currently held.`
          }
          icon={TrendingUp}
          label="Shares held"
          value={memberTier !== "tier_3" ? "Locked" : formatNaira(shares.totalValue)}
        />
        <SummaryCard
          description="Invitations waiting for your accept or decline decision."
          icon={ShieldCheck}
          label="Guarantor requests"
          tone={pendingGuarantorCount > 0 ? "danger" : "default"}
          value={pendingGuarantorCount.toLocaleString("en-NG")}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <Badge className="w-fit">Savings Trend</Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
              Savings balance over 12 months
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
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
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
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
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
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

                <div className="rounded-3xl border border-border">
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
                                    ? "border-rose-400/25 bg-rose-500/15 text-rose-100"
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
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
              Latest account activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-3xl border border-border">
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
                              ? "text-right font-medium text-rose-200"
                              : "text-right font-medium text-emerald-200"
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

      <section className="rounded-[24px] border border-border bg-card px-4 py-5 shadow-xl shadow-black/10 dark:shadow-black/30 sm:rounded-[28px] sm:px-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/15 text-emerald-100">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-foreground">Membership status</p>
              <p className="text-sm text-muted-foreground">
                {memberTier === "tier_3"
                  ? "Tier 3 active"
                  : tierMeta.nextStep}
              </p>
            </div>
          </div>
          <Button asChild variant="secondary">
            <Link href={memberTier === "tier_3" ? "/portal/savings" : "/portal/profile"}>
              {memberTier === "tier_3" ? "Open Savings" : "Complete Profile"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
