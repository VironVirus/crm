import "server-only";

import {
  MEETING_ABSENT_FEE,
  MEETING_LATE_FEE,
  resolveMeetingAttendanceStatus,
  type MeetingAttendanceStatus,
} from "@/lib/meetings";
import { sendBatchMemberNotifications } from "@/lib/notification-dispatch";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type MeetingRecord = {
  agenda: string | null;
  attendance_closes_at: string;
  created_by: string;
  daily_reminder_sent_at: string | null;
  final_reminder_sent_at: string | null;
  id: string;
  lateness_starts_at: string;
  location: string | null;
  reminder_message: string | null;
  starts_at: string;
  status: "cancelled" | "closed" | "scheduled";
  title: string;
};

type MeetingMemberRecord = {
  email: string;
  full_name: string;
  id: string;
  member_number: string | null;
};

type AttendanceRecord = {
  charge_amount: number | string | null;
  id: string;
  is_approved: boolean;
  marked_at: string | null;
  member_id: string;
  notes: string | null;
  status: MeetingAttendanceStatus;
};

function buildChargeCopy(status: MeetingAttendanceStatus) {
  return status === "late"
    ? {
        amount: MEETING_LATE_FEE,
        description:
          "Meeting attendance was marked after the lateness cutoff time.",
        sourceType: "meeting_late" as const,
        title: "Late meeting attendance charge",
      }
    : {
        amount: MEETING_ABSENT_FEE,
        description: "Meeting attendance was not marked before the close time.",
        sourceType: "meeting_absence" as const,
        title: "Missed meeting charge",
      };
}

async function syncMemberChargeForAttendance({
  admin,
  meeting,
  memberId,
  status,
  triggeredBy,
}: {
  admin: AdminClient;
  meeting: MeetingRecord;
  memberId: string;
  status: MeetingAttendanceStatus;
  triggeredBy: string;
}) {
  if (status === "present") {
    await admin
      .from("member_charges")
      .delete()
      .eq("member_id", memberId)
      .eq("source_id", meeting.id)
      .in("source_type", ["meeting_late", "meeting_absence"]);

    return 0;
  }

  const chargeCopy = buildChargeCopy(status);
  const oppositeSourceType =
    chargeCopy.sourceType === "meeting_late" ? "meeting_absence" : "meeting_late";

  await admin.from("member_charges").upsert(
    {
      amount: chargeCopy.amount,
      created_by: triggeredBy,
      description: `${chargeCopy.description} Meeting: ${meeting.title}.`,
      due_at: meeting.attendance_closes_at,
      member_id: memberId,
      source_id: meeting.id,
      source_type: chargeCopy.sourceType,
      status: "pending",
      title: chargeCopy.title,
    },
    {
      onConflict: "member_id,source_type,source_id",
    },
  );

  await admin
    .from("member_charges")
    .delete()
    .eq("member_id", memberId)
    .eq("source_id", meeting.id)
    .eq("source_type", oppositeSourceType);

  return chargeCopy.amount;
}

export async function loadMeetingById(admin: AdminClient, meetingId: string) {
  const result = await admin
    .from("meetings")
    .select(
      "id, title, agenda, location, starts_at, lateness_starts_at, attendance_closes_at, reminder_message, status, created_by, daily_reminder_sent_at, final_reminder_sent_at",
    )
    .eq("id", meetingId)
    .maybeSingle();

  return result.data as MeetingRecord | null;
}

export async function markMemberAttendance({
  admin,
  meetingId,
  memberId,
}: {
  admin: AdminClient;
  meetingId: string;
  memberId: string;
}) {
  const meeting = await loadMeetingById(admin, meetingId);

  if (!meeting || meeting.status !== "scheduled") {
    throw new Error("This meeting is not available for attendance anymore.");
  }

  const now = new Date();
  const latenessStartsAt = new Date(meeting.lateness_starts_at);
  const closesAt = new Date(meeting.attendance_closes_at);

  if (now.getTime() > closesAt.getTime()) {
    throw new Error("Attendance has already closed for this meeting.");
  }

  const status = resolveMeetingAttendanceStatus({
    latenessStartsAt,
    markedAt: now,
  });
  const nowIso = now.toISOString();
  const chargeAmount = await syncMemberChargeForAttendance({
    admin,
    meeting,
    memberId,
    status,
    triggeredBy: memberId,
  });

  const { data: attendanceRecord, error: attendanceError } = await admin
    .from("meeting_attendance")
    .upsert(
      {
        approved_at: null,
        approved_by: null,
        charge_amount: chargeAmount,
        is_approved: false,
        marked_at: nowIso,
        marked_by: memberId,
        meeting_id: meetingId,
        member_id: memberId,
        notes: null,
        status,
        updated_at: nowIso,
      },
      {
        onConflict: "meeting_id,member_id",
      },
    )
    .select("id")
    .single();

  if (attendanceError || !attendanceRecord) {
    throw new Error(
      attendanceError?.message ??
        "Attendance could not be recorded for this meeting.",
    );
  }

  return status;
}

export async function setMeetingAttendanceApproval({
  admin,
  attendanceId,
  approvedBy,
  isApproved,
  meetingId,
}: {
  admin: AdminClient;
  attendanceId: string;
  approvedBy: string;
  isApproved: boolean;
  meetingId: string;
}) {
  const { data: attendanceRecord, error: attendanceError } = await admin
    .from("meeting_attendance")
    .select("id")
    .eq("id", attendanceId)
    .eq("meeting_id", meetingId)
    .maybeSingle();

  if (attendanceError || !attendanceRecord) {
    throw new Error(
      attendanceError?.message ??
        "The attendance record could not be found for this meeting.",
    );
  }

  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("meeting_attendance")
    .update({
      approved_at: isApproved ? nowIso : null,
      approved_by: isApproved ? approvedBy : null,
      is_approved: isApproved,
      updated_at: nowIso,
    })
    .eq("id", attendanceId);

  if (error) {
    throw new Error(error.message ?? "Unable to update attendance approval.");
  }
}

export async function recalculateMeetingAttendanceStatuses({
  admin,
  meetingId,
}: {
  admin: AdminClient;
  meetingId: string;
}) {
  const meeting = await loadMeetingById(admin, meetingId);

  if (!meeting) {
    throw new Error("This meeting could not be found.");
  }

  const { data: attendanceRows } = await admin
    .from("meeting_attendance")
    .select("id, member_id, status, marked_at, charge_amount, is_approved, notes")
    .eq("meeting_id", meetingId);

  const rows = (attendanceRows as AttendanceRecord[] | null) ?? [];

  for (const row of rows) {
    const nextStatus =
      row.marked_at === null
        ? "absent"
        : resolveMeetingAttendanceStatus({
            latenessStartsAt: new Date(meeting.lateness_starts_at),
            markedAt: new Date(row.marked_at),
          });
    const chargeAmount = await syncMemberChargeForAttendance({
      admin,
      meeting,
      memberId: row.member_id,
      status: nextStatus,
      triggeredBy: meeting.created_by,
    });

    if (
      nextStatus === row.status &&
      Number(row.charge_amount ?? 0) === chargeAmount
    ) {
      continue;
    }

    await admin
      .from("meeting_attendance")
      .update({
        charge_amount: chargeAmount,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }
}

export async function finalizeMeetingAttendance({
  admin,
  meetingId,
  closedBy,
}: {
  admin: AdminClient;
  meetingId: string;
  closedBy: string;
}) {
  const meeting = await loadMeetingById(admin, meetingId);

  if (!meeting) {
    throw new Error("This meeting could not be found.");
  }

  const [{ data: activeMembers }, { data: attendanceRows }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, email, member_number")
      .eq("status", "active")
      .not("member_number", "is", null),
    admin
      .from("meeting_attendance")
      .select("id, member_id, status, marked_at, charge_amount, is_approved, notes")
      .eq("meeting_id", meetingId),
  ]);

  const attendanceMap = new Map(
    (((attendanceRows as AttendanceRecord[] | null) ?? []).map((row) => [
      row.member_id,
      row,
    ])) satisfies Array<[string, AttendanceRecord]>,
  );
  const memberRows = (activeMembers as MeetingMemberRecord[] | null) ?? [];
  const absentNotifications: Parameters<typeof sendBatchMemberNotifications>[1] = [];

  for (const member of memberRows) {
    if (attendanceMap.has(member.id)) {
      continue;
    }

    const chargeAmount = await syncMemberChargeForAttendance({
      admin,
      meeting,
      memberId: member.id,
      status: "absent",
      triggeredBy: closedBy,
    });

    await admin.from("meeting_attendance").insert({
      approved_at: null,
      approved_by: null,
      charge_amount: chargeAmount,
      is_approved: false,
      marked_at: null,
      marked_by: null,
      meeting_id: meetingId,
      member_id: member.id,
      notes: null,
      status: "absent",
      updated_at: new Date().toISOString(),
    });

    absentNotifications.push({
      actionUrl: "/portal/governance",
      contextLabel: `Attendance charge for ${member.id}`,
      emailSubject: "Meeting attendance charge - Ifemelunma Multi-Purpose Co-operative Society",
      memberId: member.id,
      message: `You were marked absent for ${meeting.title}. A charge of NGN ${chargeAmount.toLocaleString("en-NG")} has been added to your dashboard.`,
      title: "Meeting attendance charge",
      type: "attendance_charge",
    });
  }

  await admin
    .from("meetings")
    .update({
      status: "closed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", meetingId);

  if (absentNotifications.length > 0) {
    await sendBatchMemberNotifications(admin, absentNotifications);
  }
}

export async function syncMeetingState(admin: AdminClient) {
  const nowIso = new Date().toISOString();
  const { data: overdueMeetings } = await admin
    .from("meetings")
    .select(
      "id, title, agenda, location, starts_at, lateness_starts_at, attendance_closes_at, reminder_message, status, created_by, daily_reminder_sent_at, final_reminder_sent_at",
    )
    .eq("status", "scheduled")
    .lt("attendance_closes_at", nowIso);

  const meetingRows = (overdueMeetings as MeetingRecord[] | null) ?? [];

  for (const meeting of meetingRows) {
    await finalizeMeetingAttendance({
      admin,
      closedBy: meeting.created_by,
      meetingId: meeting.id,
    });
  }

  await dispatchMeetingReminders(admin);
}

export async function dispatchMeetingReminders(admin: AdminClient) {
  const now = new Date();
  const nowIso = now.toISOString();
  const inTwentyFourHours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const inSixtyMinutes = new Date(now.getTime() + 60 * 60 * 1000);

  const { data: meetings } = await admin
    .from("meetings")
    .select(
      "id, title, agenda, location, starts_at, lateness_starts_at, attendance_closes_at, reminder_message, status, created_by, daily_reminder_sent_at, final_reminder_sent_at",
    )
    .eq("status", "scheduled")
    .gte("starts_at", nowIso)
    .lte("starts_at", inTwentyFourHours.toISOString())
    .order("starts_at", { ascending: true });

  const meetingRows = (meetings as MeetingRecord[] | null) ?? [];

  if (meetingRows.length === 0) {
    return;
  }

  const { data: members } = await admin
    .from("profiles")
    .select("id, full_name, email, member_number")
    .eq("status", "active")
    .not("member_number", "is", null);

  const memberRows = (members as MeetingMemberRecord[] | null) ?? [];

  for (const meeting of meetingRows) {
    const startsAt = new Date(meeting.starts_at).getTime();
    const msUntilStart = startsAt - now.getTime();
    const shouldSendDaily =
      msUntilStart <= 24 * 60 * 60 * 1000 &&
      msUntilStart > 60 * 60 * 1000 &&
      !meeting.daily_reminder_sent_at;
    const shouldSendFinal =
      msUntilStart <= 60 * 60 * 1000 && !meeting.final_reminder_sent_at;

    if (!shouldSendDaily && !shouldSendFinal) {
      continue;
    }

    const prefix = shouldSendFinal ? "Meeting starts soon" : "Meeting reminder";
    const warnings = await sendBatchMemberNotifications(
      admin,
      memberRows.map((member) => ({
        actionUrl: "/portal/governance",
        contextLabel: `${prefix} for ${member.id}`,
        emailSubject: `${prefix} - Ifemelunma Multi-Purpose Co-operative Society`,
        memberId: member.id,
        message: `${meeting.title} is scheduled for ${new Intl.DateTimeFormat(
          "en-NG",
          {
            dateStyle: "medium",
            timeStyle: "short",
          },
        ).format(new Date(meeting.starts_at))}.${meeting.location ? ` Location: ${meeting.location}.` : ""} Lateness starts counting at ${new Intl.DateTimeFormat(
          "en-NG",
          {
            dateStyle: "medium",
            timeStyle: "short",
          },
        ).format(new Date(meeting.lateness_starts_at))}. ${meeting.reminder_message ?? ""}`.trim(),
        title: prefix,
        type: "meeting_update",
      })),
    );

    await admin
      .from("meetings")
      .update({
        daily_reminder_sent_at: shouldSendDaily
          ? nowIso
          : meeting.daily_reminder_sent_at,
        final_reminder_sent_at: shouldSendFinal
          ? nowIso
          : meeting.final_reminder_sent_at,
        updated_at: nowIso,
      })
      .eq("id", meeting.id);

    if (warnings.length > 0) {
      console.warn("Meeting reminder warnings", warnings);
    }
  }
}
