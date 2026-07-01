import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  parsePaymentAmount,
  roundCurrency,
} from "@/lib/payments";
import { formatAccountTypeLabel, type SavingsAccountType } from "@/lib/savings";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type SavingsAccountRecord = {
  balance: number | string | null;
  id: string;
  status: "active" | "closed";
};

type LoanRecord = {
  id: string;
  member_id: string;
  outstanding_balance: number | string | null;
  status: "active" | "completed" | "defaulted";
};

type ShareConfigRecord = {
  minimum_shares: number;
  share_value: number | string | null;
};

export class PaymentProcessingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PaymentProcessingError";
    this.status = status;
  }
}

function getMutationErrorStatus(message: string | undefined) {
  const normalizedMessage = message?.toLowerCase() ?? "";

  if (
    normalizedMessage.includes("insufficient") ||
    normalizedMessage.includes("cannot exceed") ||
    normalizedMessage.includes("no open repayment schedule") ||
    normalizedMessage.includes("unsupported") ||
    normalizedMessage.includes("must be")
  ) {
    return 400;
  }

  return 500;
}

async function ensureMemberExists(admin: AdminClient, memberId: string) {
  const { data: memberRecord, error } = await admin
    .from("members")
    .select("id")
    .eq("id", memberId)
    .maybeSingle();

  if (error || !memberRecord) {
    throw new PaymentProcessingError(
      "The selected member could not be found.",
      404,
    );
  }
}

export async function getLoanRepaymentTarget(
  admin: AdminClient,
  {
    loanId,
    memberId,
  }: {
    loanId: string;
    memberId: string;
  },
) {
  const { data: loan, error } = await admin
    .from("loans")
    .select("id, member_id, outstanding_balance, status")
    .eq("id", loanId)
    .eq("member_id", memberId)
    .maybeSingle();

  if (error || !loan) {
    throw new PaymentProcessingError(
      "The selected loan could not be found for this member.",
      404,
    );
  }

  return loan as LoanRecord;
}

export async function getSharePurchaseQuote(
  admin: AdminClient,
  amount: number,
) {
  const { data: shareConfig, error } = await admin
    .from("share_config")
    .select("share_value, minimum_shares")
    .limit(1)
    .maybeSingle();

  if (error || !shareConfig) {
    throw new PaymentProcessingError(
      "Share configuration is missing. Add it in Supabase before taking share payments.",
      500,
    );
  }

  const shareValue = parsePaymentAmount(
    (shareConfig as ShareConfigRecord).share_value,
  );

  if (shareValue <= 0) {
    throw new PaymentProcessingError(
      "Share configuration is incomplete. The current share value must be greater than zero.",
      500,
    );
  }

  const exactShares = amount / shareValue;
  const sharesCount = Math.round(exactShares);

  if (Math.abs(exactShares - sharesCount) > 0.000001 || sharesCount <= 0) {
    throw new PaymentProcessingError(
      `Share purchase payments must match the configured share value exactly. Current share value: ${shareValue}.`,
      400,
    );
  }

  return {
    minimumShares: (shareConfig as ShareConfigRecord).minimum_shares,
    shareValue,
    sharesCount,
  };
}

export async function recordSavingsDeposit(
  admin: AdminClient,
  {
    accountType,
    amount,
    memberId,
    narration,
    paymentReference,
  }: {
    accountType: SavingsAccountType;
    amount: number;
    memberId: string;
    narration?: string;
    paymentReference: string;
  },
) {
  const { data: existingTransaction, error: existingTransactionError } = await admin
    .from("savings_transactions")
    .select("id")
    .eq("payment_reference", paymentReference)
    .maybeSingle();

  if (existingTransactionError) {
    throw new PaymentProcessingError(
      "Unable to verify whether this savings payment was already processed.",
      500,
    );
  }

  if (existingTransaction) {
    return {
      detail: `Savings deposit into the ${formatAccountTypeLabel(accountType).toLowerCase()} account`,
      status: "duplicate" as const,
    };
  }

  await ensureMemberExists(admin, memberId);

  const { data: matchingAccounts, error: matchingAccountsError } = await admin
    .from("savings_accounts")
    .select("id, balance, status")
    .eq("member_id", memberId)
    .eq("account_type", accountType)
    .order("created_at", { ascending: false });

  if (matchingAccountsError) {
    throw new PaymentProcessingError(
      "Unable to load the savings account for this payment.",
      500,
    );
  }

  const activeAccount =
    ((matchingAccounts as SavingsAccountRecord[] | null) ?? []).find(
      (account) => account.status === "active",
    ) ?? null;

  let savingsAccountId = activeAccount?.id ?? null;

  if (!savingsAccountId) {
    const { data: createdAccount, error: createdAccountError } = await admin
      .from("savings_accounts")
      .insert({
        account_type: accountType,
        member_id: memberId,
      })
      .select("id")
      .single();

    if (createdAccountError || !createdAccount) {
      throw new PaymentProcessingError(
        "Unable to open the savings account required for this deposit.",
        500,
      );
    }

    savingsAccountId = createdAccount.id;
  }

  const { error: transactionError } = await admin.from("savings_transactions").insert({
    amount,
    created_by: memberId,
    narration: narration ?? null,
    payment_reference: paymentReference,
    savings_account_id: savingsAccountId,
    transaction_type: "deposit",
  });

  if (transactionError) {
    throw new PaymentProcessingError(
      transactionError.message ??
        "Unable to post the savings deposit right now.",
      getMutationErrorStatus(transactionError.message),
    );
  }

  return {
    detail: `Savings deposit into the ${formatAccountTypeLabel(accountType).toLowerCase()} account`,
    status: "created" as const,
  };
}

export async function recordLoanRepayment(
  admin: AdminClient,
  {
    amount,
    loanId,
    memberId,
    paymentReference,
  }: {
    amount: number;
    loanId: string;
    memberId: string;
    paymentReference: string;
  },
) {
  const { data: existingTransaction, error: existingTransactionError } = await admin
    .from("loan_transactions")
    .select("id")
    .eq("payment_reference", paymentReference)
    .eq("transaction_type", "repayment")
    .maybeSingle();

  if (existingTransactionError) {
    throw new PaymentProcessingError(
      "Unable to verify whether this loan repayment was already processed.",
      500,
    );
  }

  if (existingTransaction) {
    return {
      detail: "Loan repayment",
      status: "duplicate" as const,
    };
  }

  const loan = await getLoanRepaymentTarget(admin, {
    loanId,
    memberId,
  });
  const outstandingBalance = parsePaymentAmount(loan.outstanding_balance);

  if (!["active", "defaulted"].includes(loan.status)) {
    throw new PaymentProcessingError(
      "Only active or defaulted loans can receive repayments.",
      400,
    );
  }

  if (amount > outstandingBalance) {
    throw new PaymentProcessingError(
      "Repayment amount cannot exceed the current outstanding balance.",
      400,
    );
  }

  const { error: repaymentError } = await admin.from("loan_transactions").insert({
    amount,
    created_by: memberId,
    loan_id: loanId,
    payment_reference: paymentReference,
    transaction_type: "repayment",
  });

  if (repaymentError) {
    throw new PaymentProcessingError(
      repaymentError.message ??
        "Unable to post the loan repayment right now.",
      getMutationErrorStatus(repaymentError.message),
    );
  }

  return {
    detail: "Loan repayment",
    status: "created" as const,
  };
}

export async function recordSharePurchase(
  admin: AdminClient,
  {
    amount,
    memberId,
    notes,
    paymentReference,
  }: {
    amount: number;
    memberId: string;
    notes?: string;
    paymentReference: string;
  },
) {
  const { data: existingTransaction, error: existingTransactionError } = await admin
    .from("share_transactions")
    .select("id")
    .eq("payment_reference", paymentReference)
    .eq("transaction_type", "purchase")
    .maybeSingle();

  if (existingTransactionError) {
    throw new PaymentProcessingError(
      "Unable to verify whether this share purchase was already processed.",
      500,
    );
  }

  if (existingTransaction) {
    return {
      detail: "Share purchase",
      sharesCount: null,
      status: "duplicate" as const,
    };
  }

  await ensureMemberExists(admin, memberId);

  const quote = await getSharePurchaseQuote(admin, amount);
  const normalizedAmount = roundCurrency(amount);

  const { error: purchaseError } = await admin.from("share_transactions").insert({
    amount: normalizedAmount,
    created_by: memberId,
    member_id: memberId,
    notes: notes ?? null,
    payment_reference: paymentReference,
    shares_count: quote.sharesCount,
    transaction_type: "purchase",
  });

  if (purchaseError) {
    throw new PaymentProcessingError(
      purchaseError.message ??
        "Unable to record the share purchase right now.",
      getMutationErrorStatus(purchaseError.message),
    );
  }

  return {
    detail: `Share purchase for ${quote.sharesCount} share unit${quote.sharesCount === 1 ? "" : "s"}`,
    sharesCount: quote.sharesCount,
    status: "created" as const,
  };
}
