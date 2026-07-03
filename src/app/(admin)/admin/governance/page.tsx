import AdminGovernancePageView from "@/features/admin/governance/page-view";
import { parseMoney } from "@/lib/loans";
import { syncMeetingState } from "@/lib/meetings/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type MeetingRecord = {
  agenda: string | null;
  attendance_closes_at: string;
  created_at: string;
  id: string;
  lateness_starts_at: string;
  location: string | null;
  reminder_message: string | null;
  starts_at: string;
  status: "cancelled" | "closed" | "scheduled";
  title: string;
};

type AttendanceRecord = {
  approved_at: string | null;
  charge_amount: number | string | null;
  id: string;
  is_approved: boolean;
  marked_at: string | null;
  meeting_id: string;
  member_id: string;
  notes: string | null;
  status: "absent" | "late" | "present";
};

type ChargeRecord = {
  amount: number | string | null;
  source_id: string | null;
  status: "paid" | "pending" | "waived";
};

type ProfileRecord = {
  full_name: string;
  id: string;
  member_number: string | null;
};

export default async function AdminGovernancePage() {
  const admin = createSupabaseAdminClient();
  await syncMeetingState(admin);

  const [meetingsResult, attendanceResult, chargesResult, profilesResult] =
    await Promise.all([
      admin
        .from("meetings")
        .select(
          "id, title, agenda, location, starts_at, lateness_starts_at, attendance_closes_at, reminder_message, status, created_at",
        )
        .order("starts_at", { ascending: false }),
      admin
        .from("meeting_attendance")
        .select(
          "id, meeting_id, member_id, status, marked_at, charge_amount, is_approved, approved_at, notes",
        ),
      admin
        .from("member_charges")
        .select("source_id, amount, status")
        .in("source_type", ["meeting_late", "meeting_absence"]),
      admin
        .from("profiles")
        .select("id, full_name, member_number")
        .not("member_number", "is", null),
    ]);

  const meetings = (meetingsResult.data as MeetingRecord[] | null) ?? [];
  const attendanceRows = (attendanceResult.data as AttendanceRecord[] | null) ?? [];
  const chargeRows = (chargesResult.data as ChargeRecord[] | null) ?? [];
  const profiles = (profilesResult.data as ProfileRecord[] | null) ?? [];

  const profileMap = new Map(
    profiles.map((profile) => [profile.id, profile] as const),
  );
  const attendanceSummaryMap = new Map<
    string,
    {
      absentCount: number;
      lateCount: number;
      pendingApprovalCount: number;
      presentCount: number;
      rows: Array<{
        approvedAt: string | null;
        chargeAmount: number;
        id: string;
        isApproved: boolean;
        markedAt: string | null;
        memberId: string;
        memberName: string;
        memberNumber: string | null;
        notes: string | null;
        status: "absent" | "late" | "present";
      }>;
    }
  >();

  attendanceRows.forEach((row) => {
    const profile = profileMap.get(row.member_id);
    const current = attendanceSummaryMap.get(row.meeting_id) ?? {
      absentCount: 0,
      lateCount: 0,
      pendingApprovalCount: 0,
      presentCount: 0,
      rows: [],
    };

    if (row.status === "present") {
      current.presentCount += 1;
    } else if (row.status === "late") {
      current.lateCount += 1;
    } else {
      current.absentCount += 1;
    }

    if (!row.is_approved) {
      current.pendingApprovalCount += 1;
    }

    current.rows.push({
      approvedAt: row.approved_at,
      chargeAmount: parseMoney(row.charge_amount),
      id: row.id,
      isApproved: row.is_approved,
      markedAt: row.marked_at,
      memberId: row.member_id,
      memberName: profile?.full_name ?? "Member record unavailable",
      memberNumber: profile?.member_number ?? null,
      notes: row.notes,
      status: row.status,
    });

    attendanceSummaryMap.set(row.meeting_id, current);
  });

  const chargeSummaryMap = new Map<
    string,
    {
      chargeCount: number;
      pendingChargesAmount: number;
    }
  >();

  chargeRows.forEach((row) => {
    if (!row.source_id || row.status !== "pending") {
      return;
    }

    const current = chargeSummaryMap.get(row.source_id) ?? {
      chargeCount: 0,
      pendingChargesAmount: 0,
    };

    current.chargeCount += 1;
    current.pendingChargesAmount += parseMoney(row.amount);
    chargeSummaryMap.set(row.source_id, current);
  });

  const rows = meetings.map((meeting) => {
    const attendance = attendanceSummaryMap.get(meeting.id) ?? {
      absentCount: 0,
      lateCount: 0,
      pendingApprovalCount: 0,
      presentCount: 0,
      rows: [],
    };
    const charges = chargeSummaryMap.get(meeting.id) ?? {
      chargeCount: 0,
      pendingChargesAmount: 0,
    };

    return {
      absentCount: attendance.absentCount,
      agenda: meeting.agenda,
      attendanceClosesAt: meeting.attendance_closes_at,
      attendees: attendance.rows.sort((left, right) => {
        const leftTime = left.markedAt ? new Date(left.markedAt).getTime() : Number.POSITIVE_INFINITY;
        const rightTime = right.markedAt
          ? new Date(right.markedAt).getTime()
          : Number.POSITIVE_INFINITY;

        if (
          !Number.isFinite(leftTime) &&
          !Number.isFinite(rightTime)
        ) {
          return left.memberName.localeCompare(right.memberName);
        }

        if (leftTime === rightTime) {
          return left.memberName.localeCompare(right.memberName);
        }

        return leftTime - rightTime;
      }),
      chargeCount: charges.chargeCount,
      createdAt: meeting.created_at,
      id: meeting.id,
      lateCount: attendance.lateCount,
      latenessStartsAt: meeting.lateness_starts_at,
      location: meeting.location,
      pendingApprovalCount: attendance.pendingApprovalCount,
      pendingChargesAmount: charges.pendingChargesAmount,
      presentCount: attendance.presentCount,
      reminderMessage: meeting.reminder_message,
      startsAt: meeting.starts_at,
      status: meeting.status,
      title: meeting.title,
    };
  });

  const totals = rows.reduce(
    (accumulator, row) => {
      if (row.status === "scheduled") {
        accumulator.scheduled += 1;
      }
      if (row.status === "closed") {
        accumulator.closed += 1;
      }
      accumulator.pendingApprovals += row.pendingApprovalCount;
      accumulator.pendingChargesAmount += row.pendingChargesAmount;
      accumulator.pendingChargesCount += row.chargeCount;
      return accumulator;
    },
    {
      closed: 0,
      pendingApprovals: 0,
      pendingChargesAmount: 0,
      pendingChargesCount: 0,
      scheduled: 0,
    },
  );

  const errors = [
    meetingsResult.error?.message,
    attendanceResult.error?.message,
    chargesResult.error?.message,
    profilesResult.error?.message,
  ].filter(Boolean);

  return (
    <AdminGovernancePageView
      dataError={errors.length > 0 ? errors.join(" ") : null}
      rows={rows}
      totals={totals}
    />
  );
}
