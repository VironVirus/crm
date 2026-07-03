import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPortalFinancialRecordsData } from "@/lib/financials";
import { formatNaira } from "@/lib/loans";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function PortalFinancialsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/portal/financials");
  }

  const {
    accountRows,
    collectionsThisMonth,
    dataError,
    donationTotal,
    memberExposureRows,
    totalsByType,
  } = await getPortalFinancialRecordsData();
  const totalShares = memberExposureRows.reduce((total, row) => total + row.shares, 0);
  const totalSavings = memberExposureRows.reduce((total, row) => total + row.savings, 0);
  const totalLoans = memberExposureRows.reduce((total, row) => total + row.loans, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-border bg-card p-5 shadow-2xl shadow-black/10 dark:shadow-black/30 sm:rounded-[32px] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge className="w-fit">Financials</Badge>
            <h2 className="mt-4 font-['Outfit'] text-3xl font-semibold text-foreground">
              Cooperative financial records
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              View the full financial position of the society and download the same records for offline review.
            </p>
          </div>

          <Button asChild className="w-full lg:w-auto" variant="secondary">
            <a href="/api/portal/reports/financial-records">
              Download records
            </a>
          </Button>
        </div>
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
            {formatNaira(totalShares)}
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
                {formatNaira(totalSavings)}
              </span>
            </div>
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
              Loans outstanding across members:{" "}
              <span className="font-medium text-foreground">
                {formatNaira(totalLoans)}
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
