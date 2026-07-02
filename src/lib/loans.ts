export const LOAN_INTEREST_TYPES = ["flat", "reducing_balance"] as const;
export const LOAN_APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "disbursed",
  "closed",
] as const;
export const LOAN_BOARD_STATUSES = [
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "disbursed",
] as const;
export const LOAN_STATUSES = ["active", "completed", "defaulted"] as const;
export const LOAN_GUARANTOR_STATUSES = [
  "invited",
  "accepted",
  "declined",
] as const;

export type LoanInterestType = (typeof LOAN_INTEREST_TYPES)[number];
export type LoanApplicationStatus = (typeof LOAN_APPLICATION_STATUSES)[number];
export type LoanBoardStatus = (typeof LOAN_BOARD_STATUSES)[number];
export type LoanStatus = (typeof LOAN_STATUSES)[number];
export type LoanGuarantorStatus = (typeof LOAN_GUARANTOR_STATUSES)[number];

export type GuarantorMemberOption = {
  id: string;
  fullName: string;
  memberNumber: string | null;
  email: string;
  phone: string | null;
};

export type LoanGuarantorSummary = {
  id: string;
  guarantorMemberId: string;
  fullName: string;
  memberNumber: string | null;
  email: string;
  phone: string | null;
  status: LoanGuarantorStatus;
  invitedAt: string;
  respondedAt: string | null;
  liabilityAmount: number;
  releasedAt: string | null;
};

export type PendingGuarantorRequest = {
  id: string;
  loanApplicationId: string;
  applicantName: string;
  applicantMemberNumber: string | null;
  loanProductName: string;
  amountRequested: number;
  tenureMonths: number;
  liabilityAmount: number;
  invitedAt: string;
};

export type LoanProductOption = {
  description: string | null;
  id: string;
  name: string;
  interestRate: number;
  interestType: LoanInterestType;
  maximumDisbursableAmount: number | null;
  minAmount: number;
  maxAmount: number;
  minTenureMonths: number;
  maxTenureMonths: number;
  maxLoanToSavingsRatio: number;
  penaltyRate: number;
  processingFeeRate: number;
  termsSummary: string | null;
  isActive: boolean;
};

export function getEffectiveLoanProductMaximum(product: LoanProductOption) {
  if (
    typeof product.maximumDisbursableAmount === "number" &&
    product.maximumDisbursableAmount > 0
  ) {
    return Math.min(product.maxAmount, product.maximumDisbursableAmount);
  }

  return product.maxAmount;
}

export type MemberLoanApplicationRow = {
  id: string;
  loanProductId: string;
  productName: string;
  interestRate: number;
  interestType: LoanInterestType;
  amountRequested: number;
  tenureMonths: number;
  purpose: string;
  status: LoanApplicationStatus;
  appliedAt: string;
  rejectionReason: string | null;
  monthlyRepaymentEstimate: number;
  totalRepayableEstimate: number;
  guarantors: LoanGuarantorSummary[];
};

export type LoanDocumentLink = {
  label: string;
  path: string | null;
  signedUrl: string | null;
};

export type ExistingLoanSummary = {
  id: string;
  applicationId: string;
  principalAmount: number;
  interestRate: number;
  tenureMonths: number;
  monthlyRepayment: number;
  totalRepayable: number;
  amountDisbursed: number;
  outstandingBalance: number;
  disbursedAt: string | null;
  maturityDate: string | null;
  status: LoanStatus;
};

export type AdminLoanApplicationRow = {
  id: string;
  amountRequested: number;
  tenureMonths: number;
  purpose: string;
  status: LoanBoardStatus;
  appliedAt: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  product: LoanProductOption;
  member: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    memberNumber: string | null;
    profileStatus: "active" | "inactive" | "suspended";
    address: string;
    occupation: string;
    dateOfBirth: string;
    nextOfKinName: string | null;
    nextOfKinPhone: string | null;
    nextOfKinRelationship: string | null;
    savingsBalance: number;
    mandatorySavings: number;
    voluntarySavings: number;
    fixedDepositSavings: number;
    documents: LoanDocumentLink[];
    guarantors: LoanGuarantorSummary[];
  };
  loan: ExistingLoanSummary | null;
  existingLoans: ExistingLoanSummary[];
};

export type LoanEstimate = {
  monthlyRepayment: number;
  totalInterest: number;
  totalRepayable: number;
};

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
});

const compactNairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  notation: "compact",
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function parseMoney(value: number | string | null | undefined) {
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

export function formatNaira(value: number) {
  return nairaFormatter.format(value);
}

export function formatCompactNaira(value: number) {
  return compactNairaFormatter.format(value);
}

export function formatDisplayDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return dateFormatter.format(date);
}

export function formatLoanInterestTypeLabel(value: LoanInterestType) {
  return value === "reducing_balance" ? "Reducing balance" : "Flat";
}

export function formatGuarantorStatusLabel(value: LoanGuarantorStatus) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatLoanApplicationStatusLabel(
  value: LoanApplicationStatus | LoanStatus,
) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function calculateMaximumEligibleLoan(
  savingsBalance: number,
  maxLoanToSavingsRatio: number,
) {
  return roundCurrency(savingsBalance * maxLoanToSavingsRatio);
}

export function calculateLoanEstimate({
  annualInterestRate,
  interestType,
  principal,
  tenureMonths,
}: {
  annualInterestRate: number;
  interestType: LoanInterestType;
  principal: number;
  tenureMonths: number;
}): LoanEstimate {
  if (principal <= 0 || tenureMonths <= 0 || annualInterestRate < 0) {
    return {
      monthlyRepayment: 0,
      totalInterest: 0,
      totalRepayable: 0,
    };
  }

  if (interestType === "flat") {
    const totalInterest = roundCurrency(
      principal * (annualInterestRate / 100) * (tenureMonths / 12),
    );
    const totalRepayable = roundCurrency(principal + totalInterest);

    return {
      monthlyRepayment: roundCurrency(totalRepayable / tenureMonths),
      totalInterest,
      totalRepayable,
    };
  }

  const monthlyRate = annualInterestRate / 100 / 12;

  if (monthlyRate === 0) {
    return {
      monthlyRepayment: roundCurrency(principal / tenureMonths),
      totalInterest: 0,
      totalRepayable: roundCurrency(principal),
    };
  }

  const monthlyRepayment =
    (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
    (Math.pow(1 + monthlyRate, tenureMonths) - 1);
  const roundedMonthlyRepayment = roundCurrency(monthlyRepayment);
  const totalRepayable = roundCurrency(roundedMonthlyRepayment * tenureMonths);

  return {
    monthlyRepayment: roundedMonthlyRepayment,
    totalInterest: roundCurrency(totalRepayable - principal),
    totalRepayable,
  };
}

export function getLoanStatusTone(status: LoanApplicationStatus | LoanStatus) {
  switch (status) {
    case "submitted":
      return "border-sky-400/20 bg-sky-500/10 text-sky-100";
    case "under_review":
      return "border-amber-300/20 bg-amber-400/10 text-amber-100";
    case "approved":
    case "active":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
    case "rejected":
    case "defaulted":
      return "border-rose-400/20 bg-rose-500/10 text-rose-100";
    case "disbursed":
    case "completed":
      return "border-violet-400/20 bg-violet-500/10 text-violet-100";
    default:
      return "border-white/10 bg-white/5 text-slate-200";
  }
}

export function getGuarantorStatusTone(status: LoanGuarantorStatus) {
  switch (status) {
    case "accepted":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
    case "declined":
      return "border-rose-400/20 bg-rose-500/10 text-rose-100";
    default:
      return "border-amber-300/20 bg-amber-400/10 text-amber-100";
  }
}
