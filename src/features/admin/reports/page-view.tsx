"use client";

import { staticApiFetch } from "@/lib/static-api";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  Download,
  FileText,
  Landmark,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatReportCompactNaira,
  formatReportDate,
  formatReportMonth,
  formatReportNaira,
  getLoanBookStatusLabel,
  getLoanBookStatusTone,
  getMonthlyCollectionsSummary,
  getTrialBalanceSummary,
  isTrialBalanceBalanced,
  type LoanBookRow,
  type MonthlyCollectionsPoint,
  type ReportMemberOption,
  type TrialBalanceRow,
} from "@/lib/reports";

type AdminReportsPageViewProps = {
  dataError?: string | null;
  defaultEndDate: string;
  defaultStartDate: string;
  loanBookRows: LoanBookRow[];
  members: ReportMemberOption[];
  monthlyCollections: MonthlyCollectionsPoint[];
  trialBalanceRows: TrialBalanceRow[];
};

type ActionState =
  | {
      message: string;
      tone: "error" | "success";
    }
  | null;

type ExportTarget = "loan_book" | "monthly_collections" | "trial_balance" | null;

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

function getReportStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function exportWorkbook({
  fileName,
  rows,
  sheetName,
}: {
  fileName: string;
  rows: Record<string, string | number>[];
  sheetName: string;
}) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

export default function AdminReportsPageView({
  dataError,
  defaultEndDate,
  defaultStartDate,
  loanBookRows,
  members,
  monthlyCollections,
  trialBalanceRows,
}: AdminReportsPageViewProps) {
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? "");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [isGeneratingStatement, setIsGeneratingStatement] = useState(false);
  const [exportTarget, setExportTarget] = useState<ExportTarget>(null);
  const [actionState, setActionState] = useState<ActionState>(null);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );
  const outstandingLoanBalance = useMemo(
    () =>
      loanBookRows.reduce(
        (total, row) => total + row.outstandingBalance,
        0,
      ),
    [loanBookRows],
  );
  const overdueLoansCount = useMemo(
    () => loanBookRows.filter((row) => row.overdueStatus === "overdue").length,
    [loanBookRows],
  );
  const trialBalanceSummary = useMemo(
    () => getTrialBalanceSummary(trialBalanceRows),
    [trialBalanceRows],
  );
  const collectionsSummary = useMemo(
    () => getMonthlyCollectionsSummary(monthlyCollections),
    [monthlyCollections],
  );
  const isBalanced = useMemo(
    () => isTrialBalanceBalanced(trialBalanceRows),
    [trialBalanceRows],
  );
  const rangeInvalid = startDate > endDate;

  const handleStatementDownload = async () => {
    if (!selectedMemberId) {
      setActionState({
        message: "Choose a member before generating the statement.",
        tone: "error",
      });
      return;
    }

    if (rangeInvalid) {
      setActionState({
        message: "The statement start date cannot be after the end date.",
        tone: "error",
      });
      return;
    }

    setIsGeneratingStatement(true);
    setActionState(null);

    try {
      const query = new URLSearchParams({
        end_date: endDate,
        member_id: selectedMemberId,
        start_date: startDate,
      });
      const response = await staticApiFetch(
        `/api/admin/reports/member-statement?${query.toString()}`,
        {
          method: "GET",
        },
      );

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;

        throw new Error(
          errorPayload?.message ??
            "Unable to generate the member statement right now.",
        );
      }

      const filename =
        response.headers
          .get("content-disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ??
        `ifemelunma-member-statement-${getReportStamp()}.csv`;
      const blob = await response.blob();

      downloadBlob(blob, filename);
      setActionState({
        message: `Member statement ready for ${
          selectedMember?.fullName ?? "the selected member"
        }.`,
        tone: "success",
      });
    } catch (error) {
      setActionState({
        message:
          error instanceof Error
            ? error.message
            : "Unable to generate the member statement right now.",
        tone: "error",
      });
    } finally {
      setIsGeneratingStatement(false);
    }
  };

  const handleLoanBookExport = async () => {
    setExportTarget("loan_book");
    setActionState(null);

    try {
      await exportWorkbook({
        fileName: `ifemelunma-loan-book-${getReportStamp()}.xlsx`,
        rows: loanBookRows.map((row) => ({
          disbursement_date: row.disbursementDate
            ? formatReportDate(row.disbursementDate)
            : "",
          loan_amount: row.loanAmount,
          loan_id: row.loanId,
          member_name: row.memberName,
          member_number: row.memberNumber ?? "",
          next_due_date: row.nextDueDate ? formatReportDate(row.nextDueDate) : "",
          outstanding_balance: row.outstandingBalance,
          overdue_status: getLoanBookStatusLabel(row.overdueStatus),
          product_name: row.productName,
        })),
        sheetName: "Loan Book",
      });
    } catch (error) {
      setActionState({
        message:
          error instanceof Error
            ? error.message
            : "Unable to export the loan book right now.",
        tone: "error",
      });
    } finally {
      setExportTarget(null);
    }
  };

  const handleTrialBalanceExport = async () => {
    setExportTarget("trial_balance");
    setActionState(null);

    try {
      await exportWorkbook({
        fileName: `ifemelunma-trial-balance-${getReportStamp()}.xlsx`,
        rows: [
          ...trialBalanceRows.map((row) => ({
            account_code: row.accountCode,
            account_name: row.accountName,
            credit_total: row.creditTotal,
            debit_total: row.debitTotal,
          })),
          {
            account_code: "TOTAL",
            account_name: isBalanced ? "Balanced" : "Review required",
            credit_total: trialBalanceSummary.totalCredits,
            debit_total: trialBalanceSummary.totalDebits,
          },
        ],
        sheetName: "Trial Balance",
      });
    } catch (error) {
      setActionState({
        message:
          error instanceof Error
            ? error.message
            : "Unable to export the trial balance right now.",
        tone: "error",
      });
    } finally {
      setExportTarget(null);
    }
  };

  const handleCollectionsExport = async () => {
    setExportTarget("monthly_collections");
    setActionState(null);

    try {
      await exportWorkbook({
        fileName: `ifemelunma-monthly-collections-${getReportStamp()}.xlsx`,
        rows: monthlyCollections.map((point) => ({
          month: formatReportMonth(point.monthKey),
          loan_repayments: point.loanRepayments,
          savings_deposits: point.savingsDeposits,
          share_purchases: point.sharePurchases,
          total_collected: point.totalCollected,
        })),
        sheetName: "Monthly Collections",
      });
    } catch (error) {
      setActionState({
        message:
          error instanceof Error
            ? error.message
            : "Unable to export the monthly collections report right now.",
        tone: "error",
      });
    } finally {
      setExportTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-3">
          <Badge className="w-fit">Reports &amp; Analytics</Badge>
          <div className="space-y-2">
            <h2 className="font-['Outfit'] text-3xl font-semibold text-white">
              Generate financial and member reports without leaving the dashboard
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-300">
              Produce member-ready CSV statements, export the loan book and trial
              balance to Excel, and monitor monthly collections across savings,
              loan repayments, and share purchases.
            </p>
          </div>
        </div>

        <div className="rounded-[28px] border border-emerald-400/15 bg-emerald-500/10 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.28em] text-emerald-200">
            Last 12 months collected
          </p>
          <p className="mt-2 font-['Outfit'] text-3xl font-semibold text-white">
            {formatReportNaira(collectionsSummary.totalCollected)}
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Average {formatReportCompactNaira(collectionsSummary.averageMonthlyCollection)} per month
          </p>
        </div>
      </section>

      {dataError ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {dataError}
        </div>
      ) : null}

      {actionState ? (
        <div
          className={
            actionState.tone === "error"
              ? "rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
              : "rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
          }
        >
          {actionState.message}
        </div>
      ) : null}

      {rangeInvalid ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          The member statement start date is later than the end date. Adjust
          the range before generating the statement.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-white/[0.06]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Badge className="w-fit">CSV</Badge>
              <FileText className="h-5 w-5 text-emerald-200" />
            </div>
            <CardTitle className="font-['Outfit'] text-2xl">
              Member Statement
            </CardTitle>
            <CardDescription>
              Generate a branded member statement with savings, loan repayments,
              share holdings, and dividends.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              disabled={!selectedMemberId || isGeneratingStatement || rangeInvalid}
              onClick={handleStatementDownload}
            >
              <FileText className="mr-2 h-4 w-4" />
              {isGeneratingStatement ? "Preparing statement..." : "Generate CSV"}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.06]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Badge className="w-fit" variant="secondary">
                Excel
              </Badge>
              <Landmark className="h-5 w-5 text-sky-200" />
            </div>
            <CardTitle className="font-['Outfit'] text-2xl">Loan Book</CardTitle>
            <CardDescription>
              Export every active loan with member details, disbursement, next due
              date, outstanding balance, and overdue status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              disabled={exportTarget !== null}
              onClick={handleLoanBookExport}
              variant="secondary"
            >
              <Download className="mr-2 h-4 w-4" />
              {exportTarget === "loan_book" ? "Exporting..." : "Generate Excel"}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.06]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Badge className="w-fit" variant="outline">
                Excel
              </Badge>
              <Calculator className="h-5 w-5 text-amber-200" />
            </div>
            <CardTitle className="font-['Outfit'] text-2xl">
              Trial Balance
            </CardTitle>
            <CardDescription>
              Review debits and credits per account on screen and export the full
              trial balance workbook for finance review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              disabled={exportTarget !== null}
              onClick={handleTrialBalanceExport}
              variant="secondary"
            >
              <Download className="mr-2 h-4 w-4" />
              {exportTarget === "trial_balance" ? "Exporting..." : "Generate Excel"}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.06]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Badge className="w-fit" variant="secondary">
                Chart + Excel
              </Badge>
              <BarChart3 className="h-5 w-5 text-violet-200" />
            </div>
            <CardTitle className="font-['Outfit'] text-2xl">
              Monthly Collections
            </CardTitle>
            <CardDescription>
              Compare savings deposits, loan repayments, and share purchases over
              the last twelve months.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              disabled={exportTarget !== null}
              onClick={handleCollectionsExport}
              variant="secondary"
            >
              <Download className="mr-2 h-4 w-4" />
              {exportTarget === "monthly_collections"
                ? "Exporting..."
                : "Generate Excel"}
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="bg-white/[0.04]">
          <CardHeader>
            <Badge className="w-fit">Member Statement</Badge>
            <CardTitle className="font-['Outfit'] text-2xl">
              Configure the statement period
            </CardTitle>
            <CardDescription>
              Choose a member and date range, then download a portable CSV
              statement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="member">
                Member
              </label>
              <select
                className="flex h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition focus:border-emerald-400/60"
                id="member"
                onChange={(event) => setSelectedMemberId(event.target.value)}
                value={selectedMemberId}
              >
                {members.length === 0 ? (
                  <option value="">No registered members available</option>
                ) : null}
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName}
                    {member.memberNumber ? ` · ${member.memberNumber}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-200"
                  htmlFor="statement-start-date"
                >
                  Start date
                </label>
                <Input
                  id="statement-start-date"
                  onChange={(event) => setStartDate(event.target.value)}
                  type="date"
                  value={startDate}
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-200"
                  htmlFor="statement-end-date"
                >
                  End date
                </label>
                <Input
                  id="statement-end-date"
                  onChange={(event) => setEndDate(event.target.value)}
                  type="date"
                  value={endDate}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Selected member
              </p>
              <p className="mt-2 font-medium text-white">
                {selectedMember?.fullName ?? "No member selected"}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {selectedMember?.memberNumber ?? "Member number pending"}{" "}
                {selectedMember ? `· ${selectedMember.email}` : ""}
              </p>
            </div>

            <Button
              className="w-full"
              disabled={!selectedMemberId || isGeneratingStatement || rangeInvalid}
              onClick={handleStatementDownload}
            >
              <FileText className="mr-2 h-4 w-4" />
              {isGeneratingStatement ? "Preparing statement..." : "Download Member Statement"}
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-white/[0.04]">
            <CardHeader>
              <Badge className="w-fit" variant="secondary">
                Loan Book Snapshot
              </Badge>
              <CardTitle className="font-['Outfit'] text-3xl">
                {loanBookRows.length}
              </CardTitle>
              <CardDescription>Active loans currently on the books.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-300">
              Outstanding balance of {formatReportNaira(outstandingLoanBalance)} across
              all active loan products.
            </CardContent>
          </Card>

          <Card className="bg-white/[0.04]">
            <CardHeader>
              <Badge className="w-fit" variant="secondary">
                Trial Balance Status
              </Badge>
              <CardTitle className="font-['Outfit'] text-3xl">
                {isBalanced ? "Balanced" : "Review"}
              </CardTitle>
              <CardDescription>
                {isBalanced
                  ? "Debits and credits are currently aligned."
                  : "Debits and credits need attention before close."}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-300">
              Debits {formatReportNaira(trialBalanceSummary.totalDebits)} · Credits{" "}
              {formatReportNaira(trialBalanceSummary.totalCredits)}
            </CardContent>
          </Card>

          <Card className="bg-white/[0.04]">
            <CardHeader>
              <Badge className="w-fit" variant="outline">
                Overdue Loans
              </Badge>
              <CardTitle className="font-['Outfit'] text-3xl">
                {overdueLoansCount}
              </CardTitle>
              <CardDescription>
                Accounts currently flagged as overdue from the active loan book.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-300">
              {loanBookRows.length > 0
                ? `${Math.round((overdueLoansCount / loanBookRows.length) * 100)}% of active loans need follow-up.`
                : "No active loan records are available yet."}
            </CardContent>
          </Card>

          <Card className="bg-white/[0.04]">
            <CardHeader>
              <Badge className="w-fit" variant="outline">
                Collection Mix
              </Badge>
              <CardTitle className="font-['Outfit'] text-3xl">
                {formatReportCompactNaira(collectionsSummary.totalCollected)}
              </CardTitle>
              <CardDescription>
                Combined collections for savings, repayments, and shares.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <p>Savings: {formatReportNaira(collectionsSummary.totalSavingsDeposits)}</p>
              <p>Repayments: {formatReportNaira(collectionsSummary.totalLoanRepayments)}</p>
              <p>Shares: {formatReportNaira(collectionsSummary.totalSharePurchases)}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
        <Card className="bg-white/[0.04]">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Badge className="w-fit">Loan Book Report</Badge>
              <CardTitle className="font-['Outfit'] text-2xl">
                Active loan export
              </CardTitle>
              <CardDescription>
                Download the latest loan book workbook with balances, next due
                dates, and overdue flags for every active loan.
              </CardDescription>
            </div>
            <Button
              disabled={exportTarget !== null}
              onClick={handleLoanBookExport}
              variant="secondary"
            >
              <Download className="mr-2 h-4 w-4" />
              {exportTarget === "loan_book" ? "Exporting..." : "Export Loan Book"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loanBookRows.slice(0, 6).map((row) => (
              <div
                key={row.loanId}
                className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium text-white">{row.memberName}</p>
                    <p className="text-sm text-slate-400">
                      {row.memberNumber ?? "Member number pending"} · {row.productName}
                    </p>
                  </div>
                  <Badge className={getLoanBookStatusTone(row.overdueStatus)} variant="outline">
                    {getLoanBookStatusLabel(row.overdueStatus)}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                  <p>Loan amount: {formatReportNaira(row.loanAmount)}</p>
                  <p>Outstanding: {formatReportNaira(row.outstandingBalance)}</p>
                  <p>
                    Next due: {row.nextDueDate ? formatReportDate(row.nextDueDate) : "Not scheduled"}
                  </p>
                </div>
              </div>
            ))}

            {loanBookRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                No active loans are available yet, so the loan book export is empty for now.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bg-white/[0.04]">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Badge className="w-fit" variant="secondary">
                Trial Balance
              </Badge>
              <CardTitle className="font-['Outfit'] text-2xl">
                Debits and credits by account
              </CardTitle>
              <CardDescription>
                Review the live trial balance and export it for offline finance work.
              </CardDescription>
            </div>
            <Button
              disabled={exportTarget !== null}
              onClick={handleTrialBalanceExport}
              variant="secondary"
            >
              <Download className="mr-2 h-4 w-4" />
              {exportTarget === "trial_balance" ? "Exporting..." : "Export Trial Balance"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isBalanced ? (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <p>
                  Debits and credits do not match yet. Review recent journals before
                  closing the period.
                </p>
              </div>
            ) : null}

            <div className="rounded-3xl border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Debits</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trialBalanceRows.map((row) => (
                    <TableRow key={row.accountId}>
                      <TableCell className="font-medium text-white">
                        {row.accountCode}
                      </TableCell>
                      <TableCell>{row.accountName}</TableCell>
                      <TableCell className="text-right">
                        {formatReportNaira(row.debitTotal)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatReportNaira(row.creditTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-semibold text-white">TOTAL</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold text-white">
                      {formatReportNaira(trialBalanceSummary.totalDebits)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-white">
                      {formatReportNaira(trialBalanceSummary.totalCredits)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="bg-white/[0.04]">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Badge className="w-fit" variant="secondary">
                Monthly Collections
              </Badge>
              <CardTitle className="font-['Outfit'] text-2xl">
                Collections trend over 12 months
              </CardTitle>
              <CardDescription>
                Compare cash coming in from savings deposits, loan repayments, and
                share purchases month by month.
              </CardDescription>
            </div>
            <Button
              disabled={exportTarget !== null}
              onClick={handleCollectionsExport}
              variant="secondary"
            >
              <Download className="mr-2 h-4 w-4" />
              {exportTarget === "monthly_collections"
                ? "Exporting..."
                : "Export Collections"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Savings deposits
                </p>
                <p className="mt-2 font-['Outfit'] text-2xl font-semibold text-white">
                  {formatReportNaira(collectionsSummary.totalSavingsDeposits)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Loan repayments
                </p>
                <p className="mt-2 font-['Outfit'] text-2xl font-semibold text-white">
                  {formatReportNaira(collectionsSummary.totalLoanRepayments)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Share purchases
                </p>
                <p className="mt-2 font-['Outfit'] text-2xl font-semibold text-white">
                  {formatReportNaira(collectionsSummary.totalSharePurchases)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Combined total
                </p>
                <p className="mt-2 font-['Outfit'] text-2xl font-semibold text-white">
                  {formatReportNaira(collectionsSummary.totalCollected)}
                </p>
              </div>
            </div>

            <div className="h-[360px]">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={monthlyCollections}>
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
                    tickFormatter={(value) => formatReportCompactNaira(Number(value))}
                    tickLine={false}
                    width={92}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(2, 6, 23, 0.92)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "18px",
                    }}
                    formatter={(value) => formatReportNaira(Number(value))}
                    labelStyle={{ color: "#cbd5e1" }}
                  />
                  <Legend />
                  <Bar
                    dataKey="savingsDeposits"
                    fill="#34d399"
                    name="Savings deposits"
                    radius={[10, 10, 0, 0]}
                  />
                  <Bar
                    dataKey="loanRepayments"
                    fill="#38bdf8"
                    name="Loan repayments"
                    radius={[10, 10, 0, 0]}
                  />
                  <Bar
                    dataKey="sharePurchases"
                    fill="#f59e0b"
                    name="Share purchases"
                    radius={[10, 10, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-3xl border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Savings</TableHead>
                    <TableHead className="text-right">Repayments</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyCollections.map((point) => (
                    <TableRow key={point.monthKey}>
                      <TableCell className="font-medium text-white">
                        {formatReportMonth(point.monthKey)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatReportNaira(point.savingsDeposits)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatReportNaira(point.loanRepayments)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatReportNaira(point.sharePurchases)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatReportNaira(point.totalCollected)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
