"use client";

import type { ComponentProps } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import AdminOperationsPageView from "@/features/admin/operations/page-view";
import {
  StaticPageError,
  StaticPageLoading,
  useStaticPageData,
} from "@/components/static/static-page-state";
import {
  formatCooperativeMonth,
  getCurrentMonthStart,
  type ChargeCategory,
  type ChargeStatus,
  type CooperativeMemberOption,
  type InvestmentPlanSummary,
  type MemberChargeSummary,
  type MemberInvestmentSummary,
  type OccasionLevySummary,
} from "@/lib/cooperative-finance";
import { parseMoney } from "@/lib/loans";

type ProfileRecord = {
  full_name: string;
  id: string;
  member_number: string | null;
};

type InvestmentPlanRecord = {
  description: string | null;
  ends_on: string | null;
  id: string;
  name: string;
  projected_return_rate: number | string | null;
  starts_on: string | null;
  status: "active" | "closed";
};

type MemberInvestmentRecord = {
  amount: number | string | null;
  id: string;
  invested_at: string;
  investment_plan_id: string;
  member_id: string;
  notes: string | null;
};

type MemberChargeRecord = {
  amount: number | string | null;
  charge_category: ChargeCategory;
  created_at: string;
  description: string | null;
  due_at: string | null;
  id: string;
  member_id: string;
  status: ChargeStatus;
  title: string;
};

type OccasionLevyRecord = {
  amount: number | string | null;
  created_at: string;
  description: string | null;
  due_at: string | null;
  id: string;
  target_member_id: string | null;
  target_scope: "all_members" | "single_member";
  title: string;
};

async function loadAdminOperationsPage(
  admin: SupabaseClient,
): Promise<ComponentProps<typeof AdminOperationsPageView>> {
  const currentMonthStart = getCurrentMonthStart();
  const [profilesResult, plansResult, investmentsResult, leviesResult, chargesResult] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, member_number")
        .eq("status", "active")
        .not("member_number", "is", null)
        .order("full_name"),
      admin
        .from("investment_plans")
        .select(
          "id, name, description, projected_return_rate, starts_on, ends_on, status",
        )
        .order("created_at", { ascending: false }),
      admin
        .from("member_investments")
        .select(
          "id, investment_plan_id, member_id, amount, invested_at, notes",
        )
        .order("invested_at", { ascending: false }),
      admin
        .from("occasion_levies")
        .select(
          "id, title, description, amount, due_at, target_scope, target_member_id, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(30),
      admin
        .from("member_charges")
        .select(
          "id, member_id, charge_category, status, amount, title, description, due_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  const profiles = (profilesResult.data as ProfileRecord[] | null) ?? [];
  const planRecords =
    (plansResult.data as InvestmentPlanRecord[] | null) ?? [];
  const investmentRecords =
    (investmentsResult.data as MemberInvestmentRecord[] | null) ?? [];
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const planMap = new Map(planRecords.map((plan) => [plan.id, plan]));
  const planTotals = new Map<
    string,
    { investorIds: Set<string>; totalInvested: number }
  >();

  investmentRecords.forEach((investment) => {
    const totals = planTotals.get(investment.investment_plan_id) ?? {
      investorIds: new Set<string>(),
      totalInvested: 0,
    };
    totals.investorIds.add(investment.member_id);
    totals.totalInvested += parseMoney(investment.amount);
    planTotals.set(investment.investment_plan_id, totals);
  });

  const members: CooperativeMemberOption[] = profiles.map((profile) => ({
    fullName: profile.full_name,
    id: profile.id,
    memberNumber: profile.member_number,
  }));
  const plans: InvestmentPlanSummary[] = planRecords.map((plan) => ({
    description: plan.description,
    endsOn: plan.ends_on,
    id: plan.id,
    investorCount: planTotals.get(plan.id)?.investorIds.size ?? 0,
    name: plan.name,
    projectedReturnRate:
      plan.projected_return_rate === null
        ? null
        : parseMoney(plan.projected_return_rate),
    startsOn: plan.starts_on,
    status: plan.status,
    totalInvested: planTotals.get(plan.id)?.totalInvested ?? 0,
  }));
  const investments: MemberInvestmentSummary[] = investmentRecords.map(
    (investment) => {
      const member = profileMap.get(investment.member_id);
      const plan = planMap.get(investment.investment_plan_id);

      return {
        amount: parseMoney(investment.amount),
        id: investment.id,
        investedAt: investment.invested_at,
        memberId: investment.member_id,
        memberName: member?.full_name ?? "Registered member",
        memberNumber: member?.member_number ?? null,
        notes: investment.notes,
        planId: investment.investment_plan_id,
        planName: plan?.name ?? "Investment plan",
        projectedReturnRate:
          plan?.projected_return_rate === null ||
          plan?.projected_return_rate === undefined
            ? null
            : parseMoney(plan.projected_return_rate),
      };
    },
  );
  const charges: MemberChargeSummary[] = (
    (chargesResult.data as MemberChargeRecord[] | null) ?? []
  ).map((charge) => {
    const member = profileMap.get(charge.member_id);

    return {
      amount: parseMoney(charge.amount),
      category: charge.charge_category,
      createdAt: charge.created_at,
      description: charge.description,
      dueAt: charge.due_at,
      id: charge.id,
      memberId: charge.member_id,
      memberName: member?.full_name ?? "Registered member",
      memberNumber: member?.member_number ?? null,
      status: charge.status,
      title: charge.title,
    };
  });
  const levies: OccasionLevySummary[] = (
    (leviesResult.data as OccasionLevyRecord[] | null) ?? []
  ).map((levy) => ({
    amount: parseMoney(levy.amount),
    createdAt: levy.created_at,
    description: levy.description,
    dueAt: levy.due_at,
    id: levy.id,
    targetLabel:
      levy.target_scope === "all_members"
        ? "All active members"
        : profileMap.get(levy.target_member_id ?? "")?.full_name ??
          "Selected member",
    targetScope: levy.target_scope,
    title: levy.title,
  }));
  const errors = [
    profilesResult.error?.message,
    plansResult.error?.message,
    investmentsResult.error?.message,
    leviesResult.error?.message,
    chargesResult.error?.message,
  ].filter(Boolean);

  return {
    charges,
    currentMonthLabel: formatCooperativeMonth(currentMonthStart),
    currentMonthStart,
    dataError: errors.join(" ") || null,
    investments,
    levies,
    members,
    plans,
  };
}

export default function AdminOperationsPage() {
  const { data, error, isLoading } = useStaticPageData(loadAdminOperationsPage);

  if (isLoading && !data) return <StaticPageLoading label="Loading cooperative operations…" />;
  if (!data) return <StaticPageError>{error ?? "Operations are unavailable."}</StaticPageError>;

  return <AdminOperationsPageView {...data} dataError={data.dataError ?? error} />;
}
