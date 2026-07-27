"use client";

import type { ComponentProps } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import PortalGovernancePageView from "@/features/portal/governance/page-view";
import {
  StaticPageError,
  StaticPageLoading,
  useStaticPageData,
} from "@/components/static/static-page-state";
import { getMemberTier } from "@/lib/member-tier";
import { parseMoney } from "@/lib/loans";

type MemberRecord = {
  national_id_path: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

type ProfileRecord = {
  member_number: string | null;
};

type MeetingRecord = {
  absence_fee: number | string | null;
  agenda: string | null;
  attendance_closes_at: string;
  id: string;
  lateness_starts_at: string;
  late_fee: number | string | null;
  location: string | null;
  reminder_message: string | null;
  starts_at: string;
  status: "cancelled" | "closed" | "scheduled";
  title: string;
};

type AttendanceRecord = {
  charge_amount: number | string | null;
  is_approved: boolean;
  marked_at: string | null;
  meeting_id: string;
  status: "absent" | "late" | "present";
};

type ChargeRecord = {
  amount: number | string | null;
  source_id: string | null;
  status: "paid" | "pending" | "waived";
};

async function loadPortalGovernancePage(
  supabase: SupabaseClient,
  user: User,
): Promise<ComponentProps<typeof PortalGovernancePageView>> {
  const profileResult = await supabase
    .from("profiles")
    .select("member_number")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileResult.data as ProfileRecord | null;

  const memberResult = await supabase
    .from("members")
    .select(
      "next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
    )
    .eq("id", user.id)
    .maybeSingle();
  const member = memberResult.data as MemberRecord | null;

  const [meetingsResult, attendanceResult, chargesResult] = await Promise.all([
    supabase
      .from("meetings")
      .select(
        "id, title, agenda, location, starts_at, lateness_starts_at, attendance_closes_at, reminder_message, late_fee, absence_fee, status",
      )
      .order("starts_at", { ascending: false }),
    supabase
      .from("meeting_attendance")
      .select("meeting_id, status, marked_at, charge_amount, is_approved")
      .eq("member_id", user.id),
    supabase
      .from("member_charges")
      .select("source_id, amount, status")
      .eq("member_id", user.id)
      .in("source_type", ["meeting_late", "meeting_absence"]),
  ]);

  const attendanceMap = new Map(
    (((attendanceResult.data as AttendanceRecord[] | null) ?? []).map((row) => [
      row.meeting_id,
      row,
    ])) satisfies Array<[string, AttendanceRecord]>,
  );
  const chargeMap = new Map(
    (((chargesResult.data as ChargeRecord[] | null) ?? []).map((row) => [
      row.source_id ?? "",
      row,
    ])) satisfies Array<[string, ChargeRecord]>,
  );

  const meetings = ((meetingsResult.data as MeetingRecord[] | null) ?? []).map(
    (meeting) => {
      const attendance = attendanceMap.get(meeting.id) ?? null;
      const charge = chargeMap.get(meeting.id) ?? null;

      return {
        agenda: meeting.agenda,
        absenceFee: parseMoney(meeting.absence_fee),
        attendanceApproved: attendance?.is_approved ?? null,
        attendanceClosesAt: meeting.attendance_closes_at,
        attendanceMarkedAt: attendance?.marked_at ?? null,
        attendanceStatus: attendance?.status ?? null,
        chargeAmount: parseMoney(charge?.amount ?? attendance?.charge_amount),
        chargeStatus: charge?.status ?? null,
        id: meeting.id,
        latenessStartsAt: meeting.lateness_starts_at,
        lateFee: parseMoney(meeting.late_fee),
        location: meeting.location,
        reminderMessage: meeting.reminder_message,
        startsAt: meeting.starts_at,
        status: meeting.status,
        title: meeting.title,
      };
    },
  );

  const pendingCharges = (chargesResult.data as ChargeRecord[] | null) ?? [];
  const pendingChargesCount = pendingCharges.filter(
    (charge) => charge.status === "pending",
  ).length;
  const pendingChargesAmount = pendingCharges.reduce((total, charge) => {
    if (charge.status !== "pending") {
      return total;
    }

    return total + parseMoney(charge.amount);
  }, 0);

  const errors = [
    profileResult.error?.message,
    memberResult.error?.message,
    meetingsResult.error?.message,
    attendanceResult.error?.message,
    chargesResult.error?.message,
  ].filter(Boolean);

  return {
    dataError: errors.length > 0 ? errors.join(" ") : null,
    meetings,
    memberTier: getMemberTier(member),
    pendingChargesAmount,
    pendingChargesCount,
  };
}

export default function PortalGovernancePage() {
  const { data, error, isLoading } = useStaticPageData(loadPortalGovernancePage);

  if (isLoading && !data) return <StaticPageLoading label="Loading meetings…" />;
  if (!data) return <StaticPageError>{error ?? "Meeting records are unavailable."}</StaticPageError>;

  return <PortalGovernancePageView {...data} dataError={data.dataError ?? error} />;
}
