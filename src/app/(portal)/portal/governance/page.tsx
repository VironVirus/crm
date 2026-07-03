import { redirect } from "next/navigation";
import PortalGovernancePageView from "@/features/portal/governance/page-view";
import { getMemberTier } from "@/lib/member-tier";
import { parseMoney } from "@/lib/loans";
import { syncMeetingState } from "@/lib/meetings/server";
import { ensureMemberRecord } from "@/lib/members";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  agenda: string | null;
  attendance_closes_at: string;
  id: string;
  lateness_starts_at: string;
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

export default async function PortalGovernancePage() {
  const supabase = createServerSupabaseClient();
  const admin = createSupabaseAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/portal/governance");
  }

  await syncMeetingState(admin);

  const profileResult = await supabase
    .from("profiles")
    .select("member_number")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileResult.data as ProfileRecord | null;

  const ensuredMemberResult = await ensureMemberRecord(admin, {
    memberId: user.id,
    memberNumber: profile?.member_number ?? null,
    select:
      "next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
  });
  const member = ensuredMemberResult.data as MemberRecord | null;

  const [meetingsResult, attendanceResult, chargesResult] = await Promise.all([
    admin
      .from("meetings")
      .select(
        "id, title, agenda, location, starts_at, lateness_starts_at, attendance_closes_at, reminder_message, status",
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
        attendanceApproved: attendance?.is_approved ?? null,
        attendanceClosesAt: meeting.attendance_closes_at,
        attendanceMarkedAt: attendance?.marked_at ?? null,
        attendanceStatus: attendance?.status ?? null,
        chargeAmount: parseMoney(charge?.amount ?? attendance?.charge_amount),
        chargeStatus: charge?.status ?? null,
        id: meeting.id,
        latenessStartsAt: meeting.lateness_starts_at,
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
    ensuredMemberResult.error?.message,
    meetingsResult.error?.message,
    attendanceResult.error?.message,
    chargesResult.error?.message,
  ].filter(Boolean);

  return (
    <PortalGovernancePageView
      dataError={errors.length > 0 ? errors.join(" ") : null}
      meetings={meetings}
      memberTier={getMemberTier(member)}
      pendingChargesAmount={pendingChargesAmount}
      pendingChargesCount={pendingChargesCount}
    />
  );
}
