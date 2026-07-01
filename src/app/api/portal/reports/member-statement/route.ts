import React from "react";
import {
  renderToBuffer,
  type DocumentProps,
} from "@react-pdf/renderer";
import { NextResponse, type NextRequest } from "next/server";
import { MemberStatementDocument } from "@/lib/reporting/member-statement-document";
import {
  parseReportNumeric,
  type MemberStatementData,
  type MemberStatementDividend,
  type MemberStatementLoanRepayment,
  type MemberStatementSavingsTransaction,
} from "@/lib/reports";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { portalMemberStatementQuerySchema } from "@/lib/validation/api";

export const runtime = "nodejs";

type ProfileRecord = {
  email: string;
  full_name: string;
  member_number: string | null;
  phone: string | null;
  status: "active" | "inactive" | "suspended";
};

type MemberRecord = {
  address: string;
  date_of_birth: string;
  occupation: string;
};

type ShareHoldingRecord = {
  total_shares: number;
  total_value: number | string | null;
};

type SavingsAccountRecord = {
  account_type: string;
  id: string;
};

type SavingsTransactionRecord = {
  amount: number | string | null;
  balance_after: number | string | null;
  narration: string | null;
  payment_reference: string | null;
  savings_account_id: string;
  transaction_date: string;
  transaction_type: string;
};

type LoanRecord = {
  application_id: string;
  id: string;
  outstanding_balance: number | string | null;
};

type LoanTransactionRecord = {
  amount: number | string | null;
  loan_id: string;
  payment_reference: string | null;
  transaction_date: string;
};

type LoanApplicationRecord = {
  id: string;
  loan_product_id: string;
};

type LoanProductRecord = {
  id: string;
  name: string;
};

type DividendPaymentRecord = {
  dividend_amount: number | string | null;
  dividend_declaration_id: string;
  paid_at: string | null;
  payment_reference: string | null;
  shares_at_declaration: number;
};

type DividendDeclarationRecord = {
  financial_year: string;
  id: string;
  status: "declared" | "paid";
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function getDefaultRange() {
  const today = new Date();

  return {
    endDate: today.toISOString().slice(0, 10),
    startDate: `${today.getUTCFullYear()}-01-01`,
  };
}

function sanitizeFilenamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function getPortalStatementData({
  endDate,
  startDate,
}: {
  endDate: string;
  startDate: string;
}) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }

  const startTimestamp = `${startDate}T00:00:00.000Z`;
  const endTimestamp = `${endDate}T23:59:59.999Z`;

  const [profileResult, memberResult, shareHoldingsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, phone, member_number, status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("members")
      .select("date_of_birth, address, occupation")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("member_shares")
      .select("total_shares, total_value")
      .eq("member_id", user.id)
      .maybeSingle(),
  ]);

  const profile = profileResult.data as ProfileRecord | null;
  const member = memberResult.data as MemberRecord | null;

  if (!profile || !member) {
    throw new Error("PROFILE_NOT_FOUND");
  }

  const [savingsAccountsResult, loansResult, dividendPaymentsResult] =
    await Promise.all([
      supabase
        .from("savings_accounts")
        .select("id, account_type")
        .eq("member_id", user.id),
      supabase
        .from("loans")
        .select("id, application_id, outstanding_balance")
        .eq("member_id", user.id),
      supabase
        .from("dividend_payments")
        .select(
          "dividend_declaration_id, dividend_amount, shares_at_declaration, paid_at, payment_reference",
        )
        .eq("member_id", user.id)
        .gte("paid_at", startTimestamp)
        .lte("paid_at", endTimestamp),
    ]);

  const savingsAccounts =
    (savingsAccountsResult.data as SavingsAccountRecord[] | null) ?? [];
  const savingsAccountMap = new Map(
    savingsAccounts.map((account) => [account.id, account.account_type] as const),
  );
  const savingsAccountIds = savingsAccounts.map((account) => account.id);

  const savingsTransactionsResult =
    savingsAccountIds.length > 0
      ? await supabase
          .from("savings_transactions")
          .select(
            "savings_account_id, transaction_type, amount, balance_after, payment_reference, narration, transaction_date",
          )
          .in("savings_account_id", savingsAccountIds)
          .gte("transaction_date", startTimestamp)
          .lte("transaction_date", endTimestamp)
          .order("transaction_date", { ascending: true })
      : { data: [] as SavingsTransactionRecord[], error: null };

  const loanRecords = (loansResult.data as LoanRecord[] | null) ?? [];
  const loanIds = loanRecords.map((loan) => loan.id);
  const loanApplicationIds = loanRecords.map((loan) => loan.application_id);

  const [loanTransactionsResult, loanApplicationsResult] = await Promise.all([
    loanIds.length > 0
      ? supabase
          .from("loan_transactions")
          .select("loan_id, amount, payment_reference, transaction_date")
          .in("loan_id", loanIds)
          .eq("transaction_type", "repayment")
          .gte("transaction_date", startTimestamp)
          .lte("transaction_date", endTimestamp)
          .order("transaction_date", { ascending: true })
      : { data: [] as LoanTransactionRecord[], error: null },
    loanApplicationIds.length > 0
      ? supabase
          .from("loan_applications")
          .select("id, loan_product_id")
          .in("id", loanApplicationIds)
      : { data: [] as LoanApplicationRecord[], error: null },
  ]);

  const loanApplications =
    (loanApplicationsResult.data as LoanApplicationRecord[] | null) ?? [];
  const loanProductIds = Array.from(
    new Set(loanApplications.map((application) => application.loan_product_id)),
  );
  const loanProductsResult =
    loanProductIds.length > 0
      ? await supabase
          .from("loan_products")
          .select("id, name")
          .in("id", loanProductIds)
      : { data: [] as LoanProductRecord[], error: null };

  const dividendPayments =
    (dividendPaymentsResult.data as DividendPaymentRecord[] | null) ?? [];
  const declarationIds = Array.from(
    new Set(dividendPayments.map((payment) => payment.dividend_declaration_id)),
  );
  const declarationsResult =
    declarationIds.length > 0
      ? await supabase
          .from("dividend_declarations")
          .select("id, financial_year, status")
          .in("id", declarationIds)
      : { data: [] as DividendDeclarationRecord[], error: null };

  const statementErrors = [
    profileResult.error?.message,
    memberResult.error?.message,
    shareHoldingsResult.error?.message,
    savingsAccountsResult.error?.message,
    savingsTransactionsResult.error?.message,
    loansResult.error?.message,
    dividendPaymentsResult.error?.message,
    loanTransactionsResult.error?.message,
    loanApplicationsResult.error?.message,
    loanProductsResult.error?.message,
    declarationsResult.error?.message,
  ].filter(Boolean);

  if (statementErrors.length > 0) {
    throw new Error(statementErrors.join(" "));
  }

  const loanMap = new Map(loanRecords.map((loan) => [loan.id, loan] as const));
  const loanApplicationMap = new Map(
    loanApplications.map((application) => [application.id, application] as const),
  );
  const loanProductMap = new Map(
    (((loanProductsResult.data as LoanProductRecord[] | null) ?? []).map(
      (product) => [product.id, product] as const,
    )),
  );
  const declarationMap = new Map(
    (((declarationsResult.data as DividendDeclarationRecord[] | null) ?? []).map(
      (declaration) => [declaration.id, declaration] as const,
    )),
  );
  const shareHoldings =
    (shareHoldingsResult.data as ShareHoldingRecord | null) ?? null;

  return {
    dividends: dividendPayments.map((payment) => {
      const declaration = declarationMap.get(payment.dividend_declaration_id);

      return {
        dividendAmount: parseReportNumeric(payment.dividend_amount),
        financialYear: declaration?.financial_year ?? "Unknown year",
        paidAt: payment.paid_at,
        paymentReference: payment.payment_reference,
        sharesAtDeclaration: payment.shares_at_declaration,
        status: declaration?.status ?? "declared",
      } satisfies MemberStatementDividend;
    }),
    loanRepayments: (
      (loanTransactionsResult.data as LoanTransactionRecord[] | null) ?? []
    ).map((transaction) => {
      const loan = loanMap.get(transaction.loan_id);
      const application = loan
        ? loanApplicationMap.get(loan.application_id)
        : null;
      const product = application
        ? loanProductMap.get(application.loan_product_id)
        : null;

      return {
        amount: parseReportNumeric(transaction.amount),
        loanProductName: product?.name ?? "Cooperative loan",
        outstandingBalance: parseReportNumeric(loan?.outstanding_balance),
        paymentReference: transaction.payment_reference,
        transactionDate: transaction.transaction_date,
      } satisfies MemberStatementLoanRepayment;
    }),
    member: {
      address: member.address,
      dateOfBirth: member.date_of_birth,
      email: profile.email,
      fullName: profile.full_name,
      memberNumber: profile.member_number,
      occupation: member.occupation,
      phone: profile.phone,
      status: profile.status,
    },
    period: {
      endDate,
      startDate,
    },
    savingsTransactions: (
      (savingsTransactionsResult.data as SavingsTransactionRecord[] | null) ?? []
    ).map(
      (transaction) =>
        ({
          accountType:
            savingsAccountMap.get(transaction.savings_account_id) ?? "unknown",
          amount: parseReportNumeric(transaction.amount),
          balanceAfter: parseReportNumeric(transaction.balance_after),
          narration: transaction.narration,
          paymentReference: transaction.payment_reference,
          transactionDate: transaction.transaction_date,
          transactionType: transaction.transaction_type,
        }) satisfies MemberStatementSavingsTransaction,
    ),
    shareHoldings: {
      totalShares: shareHoldings?.total_shares ?? 0,
      totalValue: parseReportNumeric(shareHoldings?.total_value),
    },
  } satisfies MemberStatementData;
}

export async function GET(request: NextRequest) {
  const { endDate: defaultEndDate, startDate: defaultStartDate } =
    getDefaultRange();
  const startDate =
    request.nextUrl.searchParams.get("start_date")?.trim() ?? defaultStartDate;
  const endDate =
    request.nextUrl.searchParams.get("end_date")?.trim() ?? defaultEndDate;
  const parsedQuery = portalMemberStatementQuerySchema.safeParse({
    end_date: endDate,
    start_date: startDate,
  });

  if (!parsedQuery.success) {
    return jsonError(
      parsedQuery.error.issues[0]?.message ??
        "Please provide a valid statement date range.",
      400,
    );
  }

  try {
    const statement = await getPortalStatementData({
      endDate: parsedQuery.data.end_date,
      startDate: parsedQuery.data.start_date,
    });
    const buffer = await renderToBuffer(
      React.createElement(MemberStatementDocument, {
        statement,
      }) as React.ReactElement<DocumentProps>,
    );
    const filename = [
      "ifemelunma-member-statement",
      sanitizeFilenamePart(statement.member.memberNumber ?? statement.member.fullName),
      parsedQuery.data.start_date,
      parsedQuery.data.end_date,
    ]
      .filter(Boolean)
      .join("-");

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
        "Content-Type": "application/pdf",
      },
      status: 200,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return jsonError("You need to sign in before generating a statement.", 401);
    }

    if (error instanceof Error && error.message === "PROFILE_NOT_FOUND") {
      return jsonError("Your member profile could not be found.", 404);
    }

    return jsonError("Unable to generate the statement right now.", 500);
  }
}
