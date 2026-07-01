import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  type LoanBookRow,
  type LoanBookStatus,
  type MemberStatementData,
  type MemberStatementDividend,
  type MemberStatementLoanRepayment,
  type MemberStatementSavingsTransaction,
  type MonthlyCollectionsPoint,
  parseReportNumeric,
  roundReportCurrency,
  type ReportMemberOption,
  type TrialBalanceRow,
} from "@/lib/reports";

type ProfileRecord = {
  email: string;
  full_name: string;
  id: string;
  member_number: string | null;
  phone: string | null;
  status: "active" | "inactive" | "suspended";
};

type MemberRecord = {
  address: string;
  date_of_birth: string;
  id: string;
  occupation: string;
};

type LoanRecord = {
  amount_disbursed: number | string | null;
  application_id: string;
  disbursed_at: string | null;
  id: string;
  member_id: string;
  outstanding_balance: number | string | null;
  principal_amount: number | string | null;
  status: "active" | "completed" | "defaulted";
};

type LoanApplicationRecord = {
  id: string;
  loan_product_id: string;
};

type LoanProductRecord = {
  id: string;
  name: string;
};

type LoanRepaymentScheduleRecord = {
  due_date: string;
  loan_id: string;
  status: "pending" | "paid" | "overdue" | "partial";
};

type AccountRecord = {
  account_code: string;
  account_name: string;
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

type SavingsAccountRecord = {
  account_type: string;
  id: string;
  member_id: string;
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

type LoanTransactionRecord = {
  amount: number | string | null;
  loan_id: string;
  payment_reference: string | null;
  transaction_date: string;
  transaction_type: string;
};

type ShareHoldingRecord = {
  total_shares: number;
  total_value: number | string | null;
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

type ShareTransactionRecord = {
  amount: number | string | null;
  transaction_date: string;
  transaction_type: "purchase" | "transfer_in" | "transfer_out";
};

function toIsoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toMonthKey(dateValue: string) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function getCollectionWindow() {
  const currentMonth = new Date();
  currentMonth.setUTCDate(1);
  currentMonth.setUTCHours(0, 0, 0, 0);

  const startMonth = new Date(currentMonth);
  startMonth.setUTCMonth(startMonth.getUTCMonth() - 11);

  const monthKeys: string[] = [];

  for (let index = 0; index < 12; index += 1) {
    const monthDate = new Date(startMonth);
    monthDate.setUTCMonth(startMonth.getUTCMonth() + index);
    monthKeys.push(
      `${monthDate.getUTCFullYear()}-${String(
        monthDate.getUTCMonth() + 1,
      ).padStart(2, "0")}`,
    );
  }

  return {
    monthKeys,
    startDate: `${monthKeys[0]}-01T00:00:00.000Z`,
  };
}

function getLoanBookStatus({
  nextDueDate,
  schedules,
  today,
}: {
  nextDueDate: string | null;
  schedules: LoanRepaymentScheduleRecord[];
  today: string;
}): LoanBookStatus {
  if (
    schedules.some(
      (schedule) =>
        schedule.status === "overdue" || schedule.due_date < today,
    )
  ) {
    return "overdue";
  }

  if (nextDueDate === today) {
    return "due_today";
  }

  return "current";
}

function buildMonthCollectionSeries({
  loanRepaymentTransactions,
  monthKeys,
  savingsDepositTransactions,
  sharePurchaseTransactions,
}: {
  loanRepaymentTransactions: LoanTransactionRecord[];
  monthKeys: string[];
  savingsDepositTransactions: SavingsTransactionRecord[];
  sharePurchaseTransactions: ShareTransactionRecord[];
}) {
  const baseMap = new Map<
    string,
    {
      loanRepayments: number;
      savingsDeposits: number;
      sharePurchases: number;
    }
  >(
    monthKeys.map((monthKey) => [
      monthKey,
      {
        loanRepayments: 0,
        savingsDeposits: 0,
        sharePurchases: 0,
      },
    ]),
  );

  savingsDepositTransactions.forEach((transaction) => {
    const monthKey = toMonthKey(transaction.transaction_date);

    if (!monthKey || !baseMap.has(monthKey)) {
      return;
    }

    baseMap.get(monthKey)!.savingsDeposits += parseReportNumeric(
      transaction.amount,
    );
  });

  loanRepaymentTransactions.forEach((transaction) => {
    const monthKey = toMonthKey(transaction.transaction_date);

    if (!monthKey || !baseMap.has(monthKey)) {
      return;
    }

    baseMap.get(monthKey)!.loanRepayments += parseReportNumeric(
      transaction.amount,
    );
  });

  sharePurchaseTransactions.forEach((transaction) => {
    const monthKey = toMonthKey(transaction.transaction_date);

    if (!monthKey || !baseMap.has(monthKey)) {
      return;
    }

    baseMap.get(monthKey)!.sharePurchases += parseReportNumeric(
      transaction.amount,
    );
  });

  return monthKeys.map((monthKey) => {
    const monthValues = baseMap.get(monthKey)!;

    return {
      label: new Intl.DateTimeFormat("en-NG", {
        month: "short",
      }).format(new Date(`${monthKey}-01T00:00:00.000Z`)),
      loanRepayments: roundReportCurrency(monthValues.loanRepayments),
      monthKey,
      savingsDeposits: roundReportCurrency(monthValues.savingsDeposits),
      sharePurchases: roundReportCurrency(monthValues.sharePurchases),
      totalCollected: roundReportCurrency(
        monthValues.loanRepayments +
          monthValues.savingsDeposits +
          monthValues.sharePurchases,
      ),
    } satisfies MonthlyCollectionsPoint;
  });
}

export async function getReportsPageData() {
  const admin = createSupabaseAdminClient();
  const { startDate: collectionStartDate, monthKeys } = getCollectionWindow();

  const [
    membersResult,
    profilesResult,
    loansResult,
    accountsResult,
    postedEntriesResult,
    savingsDepositsResult,
    loanRepaymentsResult,
    sharePurchasesResult,
  ] = await Promise.all([
    admin.from("members").select("id").eq("onboarding_status", "registered"),
    admin
      .from("profiles")
      .select("id, full_name, email, member_number, phone, status")
      .order("full_name"),
    admin
      .from("loans")
      .select(
        "id, application_id, member_id, principal_amount, amount_disbursed, disbursed_at, outstanding_balance, status",
      )
      .eq("status", "active"),
    admin.from("accounts").select("id, account_code, account_name").order("account_code"),
    admin.from("journal_entries").select("id").eq("status", "posted"),
    admin
      .from("savings_transactions")
      .select(
        "transaction_date, amount, transaction_type, savings_account_id, payment_reference, narration, balance_after",
      )
      .eq("transaction_type", "deposit")
      .gte("transaction_date", collectionStartDate),
    admin
      .from("loan_transactions")
      .select("transaction_date, amount, transaction_type, loan_id, payment_reference")
      .eq("transaction_type", "repayment")
      .gte("transaction_date", collectionStartDate),
    admin
      .from("share_transactions")
      .select("transaction_date, amount, transaction_type")
      .eq("transaction_type", "purchase")
      .gte("transaction_date", collectionStartDate),
  ]);

  const errors = [
    membersResult.error?.message,
    profilesResult.error?.message,
    loansResult.error?.message,
    accountsResult.error?.message,
    postedEntriesResult.error?.message,
    savingsDepositsResult.error?.message,
    loanRepaymentsResult.error?.message,
    sharePurchasesResult.error?.message,
  ].filter(Boolean);

  const memberIds = new Set(
    ((membersResult.data as Array<{ id: string }> | null) ?? []).map(
      (member) => member.id,
    ),
  );
  const profileRecords = (profilesResult.data as ProfileRecord[] | null) ?? [];
  const profileMap = new Map(
    profileRecords.map((profile) => [profile.id, profile] as const),
  );

  const members = profileRecords
    .filter((profile) => memberIds.has(profile.id))
    .map(
      (profile) =>
        ({
          email: profile.email,
          fullName: profile.full_name,
          id: profile.id,
          memberNumber: profile.member_number,
        }) satisfies ReportMemberOption,
    );

  const loanRecords = (loansResult.data as LoanRecord[] | null) ?? [];
  const applicationIds = Array.from(
    new Set(loanRecords.map((loan) => loan.application_id)),
  );

  const [loanApplicationsResult, loanSchedulesResult] = await Promise.all([
    applicationIds.length > 0
      ? admin
          .from("loan_applications")
          .select("id, loan_product_id")
          .in("id", applicationIds)
      : Promise.resolve({
          data: [] as LoanApplicationRecord[],
          error: null,
        }),
    loanRecords.length > 0
      ? admin
          .from("loan_repayment_schedule")
          .select("loan_id, due_date, status")
          .in(
            "loan_id",
            loanRecords.map((loan) => loan.id),
          )
          .in("status", ["pending", "partial", "overdue"])
      : Promise.resolve({
          data: [] as LoanRepaymentScheduleRecord[],
          error: null,
        }),
  ]);

  errors.push(
    loanApplicationsResult.error?.message ?? "",
    loanSchedulesResult.error?.message ?? "",
  );

  const loanApplications = (
    loanApplicationsResult.data as LoanApplicationRecord[] | null
  ) ?? [];
  const loanProductIds = Array.from(
    new Set(loanApplications.map((application) => application.loan_product_id)),
  );
  const loanProductsResult =
    loanProductIds.length > 0
      ? await admin
          .from("loan_products")
          .select("id, name")
          .in("id", loanProductIds)
      : { data: [] as LoanProductRecord[], error: null };

  if (loanProductsResult.error?.message) {
    errors.push(loanProductsResult.error.message);
  }

  const loanApplicationMap = new Map(
    loanApplications.map((application) => [application.id, application] as const),
  );
  const loanProductMap = new Map(
    (((loanProductsResult.data as LoanProductRecord[] | null) ?? []).map(
      (product) => [product.id, product] as const,
    )),
  );
  const schedulesByLoanId = new Map<string, LoanRepaymentScheduleRecord[]>();

  (
    (loanSchedulesResult.data as LoanRepaymentScheduleRecord[] | null) ?? []
  ).forEach((schedule) => {
    const schedules = schedulesByLoanId.get(schedule.loan_id) ?? [];
    schedules.push(schedule);
    schedulesByLoanId.set(schedule.loan_id, schedules);
  });

  const today = toIsoDay(new Date());
  const loanBookRows = loanRecords
    .map((loan) => {
      const profile = profileMap.get(loan.member_id);
      const application = loanApplicationMap.get(loan.application_id);
      const product = application
        ? loanProductMap.get(application.loan_product_id)
        : null;
      const schedules = (schedulesByLoanId.get(loan.id) ?? []).sort((left, right) =>
        left.due_date.localeCompare(right.due_date),
      );
      const nextDueDate = schedules[0]?.due_date ?? null;

      return {
        disbursementDate: loan.disbursed_at,
        loanAmount: parseReportNumeric(
          loan.amount_disbursed ?? loan.principal_amount,
        ),
        loanId: loan.id,
        memberId: loan.member_id,
        memberName: profile?.full_name ?? "Registered member",
        memberNumber: profile?.member_number ?? null,
        nextDueDate,
        outstandingBalance: parseReportNumeric(loan.outstanding_balance),
        overdueStatus: getLoanBookStatus({
          nextDueDate,
          schedules,
          today,
        }),
        productName: product?.name ?? "Cooperative loan",
      } satisfies LoanBookRow;
    })
    .sort((left, right) => left.memberName.localeCompare(right.memberName));

  const accountRecords = (accountsResult.data as AccountRecord[] | null) ?? [];
  const postedEntryIds = (
    (postedEntriesResult.data as JournalEntryRecord[] | null) ?? []
  ).map((entry) => entry.id);
  const journalLinesResult =
    postedEntryIds.length > 0
      ? await admin
          .from("journal_lines")
          .select("account_id, debit_amount, credit_amount")
          .in("journal_entry_id", postedEntryIds)
      : { data: [] as JournalLineRecord[], error: null };

  if (journalLinesResult.error?.message) {
    errors.push(journalLinesResult.error.message);
  }

  const journalLines = (journalLinesResult.data as JournalLineRecord[] | null) ?? [];
  const journalTotalsByAccount = new Map<
    string,
    {
      creditTotal: number;
      debitTotal: number;
    }
  >();

  journalLines.forEach((line) => {
    const currentTotals = journalTotalsByAccount.get(line.account_id) ?? {
      creditTotal: 0,
      debitTotal: 0,
    };
    currentTotals.creditTotal += parseReportNumeric(line.credit_amount);
    currentTotals.debitTotal += parseReportNumeric(line.debit_amount);
    journalTotalsByAccount.set(line.account_id, currentTotals);
  });

  const trialBalanceRows = accountRecords.map((account) => {
    const totals = journalTotalsByAccount.get(account.id) ?? {
      creditTotal: 0,
      debitTotal: 0,
    };

    return {
      accountCode: account.account_code,
      accountId: account.id,
      accountName: account.account_name,
      creditTotal: roundReportCurrency(totals.creditTotal),
      debitTotal: roundReportCurrency(totals.debitTotal),
    } satisfies TrialBalanceRow;
  });

  const monthlyCollections = buildMonthCollectionSeries({
    loanRepaymentTransactions:
      (loanRepaymentsResult.data as LoanTransactionRecord[] | null) ?? [],
    monthKeys,
    savingsDepositTransactions:
      (savingsDepositsResult.data as SavingsTransactionRecord[] | null) ?? [],
    sharePurchaseTransactions:
      (sharePurchasesResult.data as ShareTransactionRecord[] | null) ?? [],
  });

  return {
    dataError: errors.filter(Boolean).join(" ") || null,
    loanBookRows,
    members,
    monthlyCollections,
    trialBalanceRows,
  };
}

export async function getMemberStatementData({
  endDate,
  memberId,
  startDate,
}: {
  endDate: string;
  memberId: string;
  startDate: string;
}) {
  const admin = createSupabaseAdminClient();
  const startTimestamp = `${startDate}T00:00:00.000Z`;
  const endTimestamp = `${endDate}T23:59:59.999Z`;

  const [{ data: profile }, { data: memberRecord }, { data: shareHoldings }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, email, phone, member_number, status")
        .eq("id", memberId)
        .maybeSingle(),
      admin
        .from("members")
        .select("id, date_of_birth, address, occupation")
        .eq("id", memberId)
        .maybeSingle(),
      admin
        .from("member_shares")
        .select("total_shares, total_value")
        .eq("member_id", memberId)
        .maybeSingle(),
    ]);

  if (!profile || !memberRecord) {
    throw new Error("The selected member could not be found.");
  }

  const [savingsAccountsResult, loansResult, dividendPaymentsResult] =
    await Promise.all([
      admin
        .from("savings_accounts")
        .select("id, member_id, account_type")
        .eq("member_id", memberId),
      admin
        .from("loans")
        .select("id, application_id, outstanding_balance")
        .eq("member_id", memberId),
      admin
        .from("dividend_payments")
        .select(
          "dividend_declaration_id, dividend_amount, shares_at_declaration, paid_at, payment_reference",
        )
        .eq("member_id", memberId)
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
      ? await admin
          .from("savings_transactions")
          .select(
            "savings_account_id, transaction_type, amount, balance_after, payment_reference, narration, transaction_date",
          )
          .in("savings_account_id", savingsAccountIds)
          .gte("transaction_date", startTimestamp)
          .lte("transaction_date", endTimestamp)
          .order("transaction_date", { ascending: true })
      : { data: [] as SavingsTransactionRecord[], error: null };

  const savingsTransactions = (
    (savingsTransactionsResult.data as SavingsTransactionRecord[] | null) ?? []
  ).map(
    (transaction) =>
      ({
        accountType: savingsAccountMap.get(transaction.savings_account_id) ?? "unknown",
        amount: parseReportNumeric(transaction.amount),
        balanceAfter: parseReportNumeric(transaction.balance_after),
        narration: transaction.narration,
        paymentReference: transaction.payment_reference,
        transactionDate: transaction.transaction_date,
        transactionType: transaction.transaction_type,
      }) satisfies MemberStatementSavingsTransaction,
  );

  const loanRecords = (loansResult.data as LoanRecord[] | null) ?? [];
  const loanIds = loanRecords.map((loan) => loan.id);
  const loanApplicationIds = loanRecords.map((loan) => loan.application_id);

  const [loanTransactionsResult, loanApplicationsResult] = await Promise.all([
    loanIds.length > 0
      ? admin
          .from("loan_transactions")
          .select("loan_id, transaction_type, amount, payment_reference, transaction_date")
          .in("loan_id", loanIds)
          .eq("transaction_type", "repayment")
          .gte("transaction_date", startTimestamp)
          .lte("transaction_date", endTimestamp)
          .order("transaction_date", { ascending: true })
      : { data: [] as LoanTransactionRecord[], error: null },
    loanApplicationIds.length > 0
      ? admin
          .from("loan_applications")
          .select("id, loan_product_id")
          .in("id", loanApplicationIds)
      : { data: [] as LoanApplicationRecord[], error: null },
  ]);

  const statementLoanApplications =
    (loanApplicationsResult.data as LoanApplicationRecord[] | null) ?? [];
  const statementLoanProductIds = Array.from(
    new Set(
      statementLoanApplications.map((application) => application.loan_product_id),
    ),
  );
  const statementLoanProductsResult =
    statementLoanProductIds.length > 0
      ? await admin
          .from("loan_products")
          .select("id, name")
          .in("id", statementLoanProductIds)
      : { data: [] as LoanProductRecord[], error: null };

  const loanMap = new Map(loanRecords.map((loan) => [loan.id, loan] as const));
  const loanApplicationMap = new Map(
    statementLoanApplications.map((application) => [application.id, application] as const),
  );
  const loanProductMap = new Map(
    (((statementLoanProductsResult.data as LoanProductRecord[] | null) ?? []).map(
      (product) => [product.id, product] as const,
    )),
  );

  const loanRepayments = (
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
  });

  const dividendPayments =
    (dividendPaymentsResult.data as DividendPaymentRecord[] | null) ?? [];
  const declarationIds = Array.from(
    new Set(
      dividendPayments.map((payment) => payment.dividend_declaration_id),
    ),
  );
  const declarationsResult =
    declarationIds.length > 0
      ? await admin
          .from("dividend_declarations")
          .select("id, financial_year, status")
          .in("id", declarationIds)
      : { data: [] as DividendDeclarationRecord[], error: null };

  const declarationMap = new Map(
    (((declarationsResult.data as DividendDeclarationRecord[] | null) ?? []).map(
      (declaration) => [declaration.id, declaration] as const,
    )),
  );

  const dividends = dividendPayments.map((payment) => {
    const declaration = declarationMap.get(payment.dividend_declaration_id);

    return {
      dividendAmount: parseReportNumeric(payment.dividend_amount),
      financialYear: declaration?.financial_year ?? "Unknown year",
      paidAt: payment.paid_at,
      paymentReference: payment.payment_reference,
      sharesAtDeclaration: payment.shares_at_declaration,
      status: declaration?.status ?? "declared",
    } satisfies MemberStatementDividend;
  });

  return {
    dividends,
    loanRepayments,
    member: {
      address: memberRecord.address,
      dateOfBirth: memberRecord.date_of_birth,
      email: profile.email,
      fullName: profile.full_name,
      memberNumber: profile.member_number,
      occupation: memberRecord.occupation,
      phone: profile.phone,
      status: profile.status,
    },
    period: {
      endDate,
      startDate,
    },
    savingsTransactions,
    shareHoldings: {
      totalShares: (shareHoldings as ShareHoldingRecord | null)?.total_shares ?? 0,
      totalValue: parseReportNumeric(
        (shareHoldings as ShareHoldingRecord | null)?.total_value,
      ),
    },
  } satisfies MemberStatementData;
}
