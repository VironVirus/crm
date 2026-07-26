export const MONTHLY_DUES_AMOUNT = 10_000;

export const CHARGE_CATEGORIES = [
  "monthly_due",
  "occasion_levy",
  "meeting_penalty",
  "manual",
] as const;

export const CHARGE_STATUSES = ["pending", "paid", "waived"] as const;

export type ChargeCategory = (typeof CHARGE_CATEGORIES)[number];
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

export type CooperativeMemberOption = {
  id: string;
  fullName: string;
  memberNumber: string | null;
};

export type InvestmentPlanSummary = {
  id: string;
  name: string;
  description: string | null;
  projectedReturnRate: number | null;
  startsOn: string | null;
  endsOn: string | null;
  status: "active" | "closed";
  totalInvested: number;
  investorCount: number;
};

export type MemberInvestmentSummary = {
  id: string;
  amount: number;
  investedAt: string;
  memberId: string;
  memberName: string;
  memberNumber: string | null;
  notes: string | null;
  planId: string;
  planName: string;
  projectedReturnRate: number | null;
};

export type MemberChargeSummary = {
  id: string;
  amount: number;
  category: ChargeCategory;
  createdAt: string;
  description: string | null;
  dueAt: string | null;
  memberId: string;
  memberName: string;
  memberNumber: string | null;
  status: ChargeStatus;
  title: string;
};

export type OccasionLevySummary = {
  id: string;
  amount: number;
  createdAt: string;
  description: string | null;
  dueAt: string | null;
  targetLabel: string;
  targetScope: "all_members" | "single_member";
  title: string;
};

export type PortalInvestmentPosition = {
  amount: number;
  planId: string;
  planName: string;
  projectedReturnRate: number | null;
};

export type PortalChargeItem = {
  amount: number;
  category: ChargeCategory;
  dueAt: string | null;
  id: string;
  status: ChargeStatus;
  title: string;
};

export type PortalMonthlyDueSummary = {
  amount: number;
  dueAt: string | null;
  status: ChargeStatus;
};

const monthFormatter = new Intl.DateTimeFormat("en-NG", {
  month: "long",
  year: "numeric",
});

export function getCurrentMonthStart() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-01`;
}

export function formatCooperativeMonth(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : monthFormatter.format(date);
}

export function getChargeCategoryLabel(category: ChargeCategory) {
  switch (category) {
    case "monthly_due":
      return "Monthly dues";
    case "occasion_levy":
      return "Occasion levy";
    case "meeting_penalty":
      return "Attendance penalty";
    case "manual":
    default:
      return "Other charge";
  }
}
