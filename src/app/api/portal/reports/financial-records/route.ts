import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { COOPERATIVE_NAME } from "@/lib/brand";
import { getPortalFinancialRecordsData } from "@/lib/financials";
import { getTransactionDateStamp } from "@/lib/transaction-references";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function GET() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before downloading financial records.", 401);
  }

  const financialData = await getPortalFinancialRecordsData();

  if (financialData.dataError) {
    return jsonError(
      "The financial records could not be prepared for download right now.",
      500,
    );
  }

  const totalSavings = financialData.memberExposureRows.reduce(
    (total, row) => total + row.savings,
    0,
  );
  const totalLoans = financialData.memberExposureRows.reduce(
    (total, row) => total + row.loans,
    0,
  );
  const totalShares = financialData.memberExposureRows.reduce(
    (total, row) => total + row.shares,
    0,
  );

  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.json_to_sheet([
    { metric: "Cooperative", value: COOPERATIVE_NAME },
    { metric: "Generated on", value: new Date().toISOString() },
    { metric: "Total assets", value: financialData.totalsByType.asset },
    { metric: "Total liabilities", value: financialData.totalsByType.liability },
    { metric: "Share capital", value: totalShares },
    { metric: "Income recorded", value: financialData.totalsByType.income },
    { metric: "Expenses recorded", value: financialData.totalsByType.expense },
    { metric: "Collections this month", value: financialData.collectionsThisMonth },
    { metric: "Savings balance", value: totalSavings },
    { metric: "Loans outstanding", value: totalLoans },
    { metric: "Donations recorded", value: financialData.donationTotal },
    {
      metric: "Net position",
      value: financialData.totalsByType.income - financialData.totalsByType.expense,
    },
  ]);

  const ledgerSheet = XLSX.utils.json_to_sheet(
    financialData.accountRows.map((row) => ({
      "Account code": row.accountCode,
      "Account name": row.accountName,
      "Account type": row.accountType,
      Debit: row.debit,
      Credit: row.credit,
      Balance: row.balance,
    })),
  );

  const memberBalancesSheet = XLSX.utils.json_to_sheet(
    financialData.memberExposureRows.map((row) => ({
      Member: row.fullName,
      "Member number": row.memberNumber ?? "",
      Savings: row.savings,
      Loans: row.loans,
      Shares: row.shares,
    })),
  );

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(workbook, ledgerSheet, "Ledger");
  XLSX.utils.book_append_sheet(workbook, memberBalancesSheet, "Member Balances");

  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  });
  const filename = `ifemelunma-financial-records-${getTransactionDateStamp()}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
