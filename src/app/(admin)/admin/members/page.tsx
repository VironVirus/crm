"use client";

import type { ComponentProps } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import AdminMembersPageView from "@/features/admin/members/page-view";
import {
  StaticPageError,
  StaticPageLoading,
  useStaticPageData,
} from "@/components/static/static-page-state";
import { type CooperativeRole } from "@/lib/auth/roles";
import { getMemberTier } from "@/lib/member-tier";

type ProfileRecord = {
  email: string;
  full_name: string;
  id: string;
  is_verified: boolean;
  member_number: string | null;
  phone: string | null;
  role: CooperativeRole;
  status: "active" | "inactive" | "suspended";
  verification_note: string | null;
};

type MemberRecord = {
  created_at: string;
  id: string;
  national_id_path: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

type SavingsAccountRecord = {
  balance: number | string | null;
  member_id: string;
};

type ShareHoldingRecord = {
  member_id: string;
  total_value: number | string | null;
};

function parseMoney(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

async function loadAdminMembersPage(
  admin: SupabaseClient,
): Promise<ComponentProps<typeof AdminMembersPageView>> {
  const [profilesResult, membersResult, savingsResult, sharesResult] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, full_name, email, phone, member_number, role, status, is_verified, verification_note",
      )
      .not("member_number", "is", null)
      .order("created_at", { ascending: false }),
    admin
      .from("members")
      .select(
        "id, created_at, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
      ),
    admin
      .from("savings_accounts")
      .select("member_id, balance")
      .eq("status", "active"),
    admin.from("member_shares").select("member_id, total_value"),
  ]);

  const profiles = (profilesResult.data as ProfileRecord[] | null) ?? [];
  const members = new Map(
    (((membersResult.data as MemberRecord[] | null) ?? []).map((member) => [
      member.id,
      member,
    ])) satisfies Array<[string, MemberRecord]>,
  );

  const savingsByMember = new Map<string, number>();
  ((savingsResult.data as SavingsAccountRecord[] | null) ?? []).forEach((account) => {
    savingsByMember.set(
      account.member_id,
      (savingsByMember.get(account.member_id) ?? 0) + parseMoney(account.balance),
    );
  });

  const sharesByMember = new Map<string, number>();
  ((sharesResult.data as ShareHoldingRecord[] | null) ?? []).forEach((holding) => {
    sharesByMember.set(holding.member_id, parseMoney(holding.total_value));
  });

  const rows = profiles.flatMap((profile) => {
    const member = members.get(profile.id) ?? null;

    if (!member) {
      return [];
    }

    const tier = getMemberTier(member);

    return [{
      email: profile.email,
      fullName: profile.full_name,
      hasCompleteKyc: Boolean(
        member.national_id_path &&
          member.passport_photo_path &&
          member.utility_bill_path,
      ),
      hasNextOfKin: Boolean(
        member.next_of_kin_name &&
          member.next_of_kin_phone &&
          member.next_of_kin_relationship,
      ),
      id: profile.id,
      isVerified: profile.is_verified,
      joinedAt: member.created_at,
      memberNumber: profile.member_number,
      phone: profile.phone,
      role: profile.role,
      savingsBalance: savingsByMember.get(profile.id) ?? 0,
      sharesValue: sharesByMember.get(profile.id) ?? 0,
      status: profile.status,
      tier,
      verificationNote: profile.verification_note,
    }];
  });

  const totals = rows.reduce(
    (accumulator, row) => {
      accumulator.members += 1;
      accumulator.savings += row.savingsBalance;
      accumulator.shares += row.sharesValue;
      if (row.isVerified) {
        accumulator.verified += 1;
      }
      if (row.status === "active") {
        accumulator.active += 1;
      }
      return accumulator;
    },
    { active: 0, members: 0, savings: 0, shares: 0, verified: 0 },
  );

  const errors = [
    profilesResult.error?.message,
    membersResult.error?.message,
    savingsResult.error?.message,
    sharesResult.error?.message,
  ].filter(Boolean);

  return {
    dataError: errors.length > 0 ? errors.join(" ") : null,
    rows,
    totals,
  };
}

export default function AdminMembersPage() {
  const { data, error, isLoading } = useStaticPageData(loadAdminMembersPage);

  if (isLoading && !data) return <StaticPageLoading label="Loading members…" />;
  if (!data) return <StaticPageError>{error ?? "Member records are unavailable."}</StaticPageError>;

  return <AdminMembersPageView {...data} dataError={data.dataError ?? error} />;
}
