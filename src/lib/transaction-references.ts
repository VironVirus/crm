import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type PaymentReferenceRow = {
  payment_reference: string | null;
};

type TransactionLogRow = {
  tx_ref: string | null;
};

const lagosDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Africa/Lagos",
  year: "numeric",
});

function getFormattedDateParts(date: Date) {
  const parts = lagosDateFormatter.formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return {
    day: lookup.get("day") ?? "01",
    month: lookup.get("month") ?? "01",
    year: lookup.get("year") ?? "1970",
  };
}

function extractDailySerial(value: string | null, prefix: string) {
  if (!value?.startsWith(prefix)) {
    return null;
  }

  const digits = value.slice(prefix.length, prefix.length + 4);

  if (!/^\d{4}$/.test(digits)) {
    return null;
  }

  return Number.parseInt(digits, 10);
}

export function getTransactionDateStamp(date = new Date()) {
  const { day, month, year } = getFormattedDateParts(date);
  return `${year}${month}${day}`;
}

export function buildTransactionReferencePrefix(date = new Date()) {
  return `IMPCS${getTransactionDateStamp(date)}`;
}

export function composeTransactionReference(
  internalReference: string,
  externalReference?: string | null,
) {
  const normalizedExternalReference = externalReference?.trim();

  if (!normalizedExternalReference) {
    return internalReference;
  }

  return `${internalReference} / ${normalizedExternalReference}`;
}

export async function generateTransactionReference(admin: AdminClient) {
  const prefix = buildTransactionReferencePrefix();

  const [
    savingsResult,
    loanResult,
    shareResult,
    dividendResult,
    paymentLogResult,
  ] = await Promise.all([
    admin
      .from("savings_transactions")
      .select("payment_reference")
      .like("payment_reference", `${prefix}%`),
    admin
      .from("loan_transactions")
      .select("payment_reference")
      .like("payment_reference", `${prefix}%`),
    admin
      .from("share_transactions")
      .select("payment_reference")
      .like("payment_reference", `${prefix}%`),
    admin
      .from("dividend_payments")
      .select("payment_reference")
      .like("payment_reference", `${prefix}%`),
    admin.from("payment_logs").select("tx_ref").like("tx_ref", `${prefix}%`),
  ]);

  const errors = [
    savingsResult.error,
    loanResult.error,
    shareResult.error,
    dividendResult.error,
    paymentLogResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw errors[0];
  }

  const serialPool = [
    ...((savingsResult.data as PaymentReferenceRow[] | null) ?? []).map((row) =>
      extractDailySerial(row.payment_reference, prefix),
    ),
    ...((loanResult.data as PaymentReferenceRow[] | null) ?? []).map((row) =>
      extractDailySerial(row.payment_reference, prefix),
    ),
    ...((shareResult.data as PaymentReferenceRow[] | null) ?? []).map((row) =>
      extractDailySerial(row.payment_reference, prefix),
    ),
    ...((dividendResult.data as PaymentReferenceRow[] | null) ?? []).map((row) =>
      extractDailySerial(row.payment_reference, prefix),
    ),
    ...((paymentLogResult.data as TransactionLogRow[] | null) ?? []).map((row) =>
      extractDailySerial(row.tx_ref, prefix),
    ),
  ].filter((value): value is number => typeof value === "number");

  const nextSerial = Math.max(0, ...serialPool) + 1;

  return `${prefix}${String(nextSerial).padStart(4, "0")}`;
}
