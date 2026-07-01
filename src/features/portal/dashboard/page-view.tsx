"use client";

import Link from "next/link";
import { type ComponentType, useState } from "react";
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  Download,
  FileText,
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
  paymentLoanOptions: MemberPaymentLoanOption[];
  pendingGuarantorCount: number;
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
          : "border-white/15 bg-[#111827]"
      }
    >
      <CardHeader className="space-y-4">
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
          <CardTitle className="font-['Outfit'] text-3xl text-white">
            {value}
          </CardTitle>
          <CardDescription
            className={danger ? "text-rose-100/85" : "text-slate-200"}
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
  paymentLoanOptions,
  pendingGuarantorCount,
  recentTransactions,
  savingsBalance,
  savingsTrend,
  shareConfig,
  shares,
}: MemberDashboardPageViewProps) {
  const [statementError, setStatementError] = useState<string | null>(null);
  const [isGeneratingStatement, setIsGeneratingStatement] = useState(false);

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
        `ifemelumma-member-statement-${new Date().toISOString().slice(0, 10)}.pdf`;
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

      <section className="rounded-[28px] border border-white/15 bg-[#111827] px-5 py-5 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Badge className="w-fit">Member Dashboard</Badge>
            <h2 className="font-['Outfit'] text-3xl font-semibold text-white">
              Welcome back, {memberName}
            </h2>
            <p className="text-sm text-slate-200">
              {memberNumber ?? "Member number pending"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <MakePaymentDialog
              activeLoans={paymentLoanOptions}
              memberId={memberId}
              memberName={memberName}
              memberNumber={memberNumber}
              shareConfig={shareConfig}
            />
            <Button asChild variant="secondary">
              <Link href="/portal/loans">
                <Landmark className="mr-2 h-4 w-4" />
                Apply for Loan
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          description="Mandatory and voluntary savings combined."
          icon={PiggyBank}
          label="Savings balance"
          value={formatNaira(savingsBalance)}
        />
        <SummaryCard
          description={
            activeLoan?.nextRepaymentDate
              ? `Next: ${formatDisplayDate(activeLoan.nextRepaymentDate)} · ${formatNaira(activeLoan.nextRepaymentAmount)}`
              : "No active repayment schedule available."
          }
          icon={CalendarClock}
          label="Active loan"
          value={activeLoan ? formatNaira(activeLoan.outstandingBalance) : "None"}
        />
        <SummaryCard
          description={`${shares.totalShares.toLocaleString("en-NG")} share unit${
            shares.totalShares === 1 ? "" : "s"
          } currently held.`}
          icon={TrendingUp}
          label="Shares held"
          value={formatNaira(shares.totalValue)}
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
        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <Badge className="w-fit">Savings Trend</Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-white">
              Savings balance over 12 months
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer height="100%" width="100%">
                <LineChart data={savingsTrend}>
                  <CartesianGrid stroke="rgba(255,255,255,0.12)" vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="label"
                    tick={{ fill: "#cbd5e1", fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    tick={{ fill: "#cbd5e1", fontSize: 12 }}
                    tickFormatter={(value) => formatCompactNaira(Number(value))}
                    tickLine={false}
                    width={92}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(17, 24, 39, 0.98)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: "18px",
                    }}
                    formatter={(value) => formatNaira(Number(value))}
                    labelStyle={{ color: "#e2e8f0" }}
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

        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <Badge className="w-fit" variant="secondary">
              Loan Progress
            </Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-white">
              Repayment progress
            </CardTitle>
            <CardDescription className="text-slate-200">
              {activeLoan?.productName ?? "No active loan currently selected."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {activeLoan ? (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <span>{activeLoan.progressPercent}% repaid</span>
                    <span>
                      {formatNaira(activeLoan.totalRepaid)} of{" "}
                      {formatNaira(activeLoan.totalRepayable)}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-400"
                      style={{ width: `${activeLoan.progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-3xl border border-white/15">
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
                          <TableCell className="text-slate-300" colSpan={3}>
                            No upcoming installments are scheduled.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="rounded-3xl border border-dashed border-white/15 bg-slate-900/70 px-4 py-10 text-center text-sm text-slate-200">
                No active loan is currently on your profile.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <Badge className="w-fit" variant="secondary">
              Quick Actions
            </Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-white">
              Member tasks
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <MakePaymentDialog
              activeLoans={paymentLoanOptions}
              memberId={memberId}
              memberName={memberName}
              memberNumber={memberNumber}
              shareConfig={shareConfig}
            />
            <Button asChild variant="secondary">
              <Link href="/portal/loans">
                <Landmark className="mr-2 h-4 w-4" />
                Apply for Loan
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
                <FileText className="mr-2 h-4 w-4" />
              )}
              View Statement
            </Button>
            <Button asChild variant="secondary">
              <Link href="/portal/notifications">
                <BellRing className="mr-2 h-4 w-4" />
                View Notifications
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <Badge className="w-fit" variant="secondary">
              Recent Transactions
            </Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-white">
              Latest account activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-3xl border border-white/15">
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
                        <TableCell className="text-slate-200">
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
                        <TableCell className="text-slate-300">
                          {formatDisplayDate(transaction.date)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-slate-300" colSpan={4}>
                        Your recent savings, loan, and share transactions will
                        appear here.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="rounded-[28px] border border-white/15 bg-[#111827] px-5 py-5 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/15 text-emerald-100">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-white">Portal sections</p>
              <p className="text-sm text-slate-300">
                Savings, loans, statements, and notifications are available
                from the main member navigation.
              </p>
            </div>
          </div>
          <Button asChild variant="secondary">
            <Link href="/portal/savings">
              Open Savings
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
