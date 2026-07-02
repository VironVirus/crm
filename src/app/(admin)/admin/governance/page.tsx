import AdminGovernancePageView from "@/features/admin/governance/page-view";
import { parseMoney } from "@/lib/loans";
import { syncMeetingState } from "@/lib/meetings/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type MeetingRecord = {
  agenda: string | null;
  attendance_closes_at: string;
  created_at: string;
  id: string;
  location: string | null;
  reminder_message: string | null;
  starts_at: string;
  status: "cancelled" | "closed" | "scheduled";
  title: string;
};

type AttendanceRecord = {
  meeting_id: string;
  status: "absent" | "late" | "present";
};

type ChargeRecord = {
  amount: number | string | null;
  source_id: string | null;
  status: "paid" | "pending" | "waived";
};

export default async function AdminGovernancePage() {
  const admin = createSupabaseAdminClient();
  await syncMeetingState(admin);

  const [meetingsResult, attendanceResult, chargesResult] = await Promise.all([
    admin
      .from("meetings")
      .select(
        "id, title, agenda, location, starts_at, attendance_closes_at, reminder_message, status, created_at",
      )
      .order("starts_at", { ascending: false }),
    admin.from("meeting_attendance").select("meeting_id, status"),
    admin
      .from("member_charges")
      .select("source_id, amount, status")
      .in("source_type", ["meeting_late", "meeting_absence"]),
  ]);

  const meetings = (meetingsResult.data as MeetingRecord[] | null) ?? [];
  const attendanceRows = (attendanceResult.data as AttendanceRecord[] | null) ?? [];
  const chargeRows = (chargesResult.data as ChargeRecord[] | null) ?? [];

  const attendanceSummaryMap = new Map<
    string,
    {
      absentCount: number;
      lateCount: number;
      presentCount: number;
    }
  >();

  attendanceRows.forEach((row) => {
    const current = attendanceSummaryMap.get(row.meeting_id) ?? {
      absentCount: 0,
      lateCount: 0,
      presentCount: 0,
    };

    if (row.status === "present") {
      current.presentCount += 1;
    } else if (row.status === "late") {
      current.lateCount += 1;
    } else {
      current.absentCount += 1;
    }

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
      presentCount: 0,
    };
    const charges = chargeSummaryMap.get(meeting.id) ?? {
      chargeCount: 0,
      pendingChargesAmount: 0,
    };

    return {
      absentCount: attendance.absentCount,
      agenda: meeting.agenda,
      attendanceClosesAt: meeting.attendance_closes_at,
      chargeCount: charges.chargeCount,
      createdAt: meeting.created_at,
      id: meeting.id,
      lateCount: attendance.lateCount,
      location: meeting.location,
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
      accumulator.pendingChargesAmount += row.pendingChargesAmount;
      accumulator.pendingChargesCount += row.chargeCount;
      return accumulator;
    },
    {
      closed: 0,
      pendingChargesAmount: 0,
      pendingChargesCount: 0,
      scheduled: 0,
    },
  );

  const errors = [
    meetingsResult.error?.message,
    attendanceResult.error?.message,
    chargesResult.error?.message,
  ].filter(Boolean);

  return (
    <AdminGovernancePageView
      dataError={errors.length > 0 ? errors.join(" ") : null}
      rows={rows}
      totals={totals}
    />
  );
}
