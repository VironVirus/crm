export const PAYMENT_TYPES = [
  "savings_deposit",
  "loan_repayment",
  "share_purchase",
] as const;

export type PaymentType = (typeof PAYMENT_TYPES)[number];

export type MemberPaymentLoanOption = {
  id: string;
  monthlyRepayment: number;
  outstandingBalance: number;
  productName: string;
};

export type MemberPaymentShareConfig = {
  minimumShares: number;
  shareValue: number;
};

export type InitiatePaymentResponse = {
  paymentLink: string;
  txRef: string;
};

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
});

export function parsePaymentAmount(
  value: number | string | null | undefined,
) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatPaymentAmount(value: number) {
  return nairaFormatter.format(value);
}

export function formatPaymentTypeLabel(value: PaymentType) {
  switch (value) {
    case "savings_deposit":
      return "Savings deposit";
    case "loan_repayment":
      return "Loan repayment";
    case "share_purchase":
      return "Share purchase";
    default:
      return value;
  }
}

export function isPaymentType(value: string): value is PaymentType {
  return PAYMENT_TYPES.includes(value as PaymentType);
}

function normalizeTxRefSegment(value: string | null | undefined) {
  const normalized = (value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "PENDING";
}

export function buildFlutterwaveTxRef(memberNumber: string | null | undefined) {
  return `COOP-${Date.now()}-${normalizeTxRefSegment(memberNumber)}`;
}
