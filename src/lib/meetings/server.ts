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
  id: string;
  location: string | null;
  reminder_message: string | null;
  starts_at: string;
  status: "cancelled" | "closed" | "scheduled";
  title: string;
  daily_reminder_sent_at: string | null;
  final_reminder_sent_at: string | null;
};

type MeetingMemberRecord = {
  email: string;
  full_name: string;
  id: string;
  member_number: string | null;
};

type AttendanceRecord = {
  id: string;
  marked_at: string | null;
  member_id: string;
  status: MeetingAttendanceStatus;
};

function buildChargeCopy(status: MeetingAttendanceStatus) {
  return status === "late"
    ? {
        amount: MEETING_LATE_FEE,
        description:
          "Meeting attendance was marked after the scheduled start time.",
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

export async function loadMeetingById(admin: AdminClient, meetingId: string) {
  const result = await admin
    .from("meetings")
    .select(
      "id, title, agenda, location, starts_at, attendance_closes_at, reminder_message, status, created_by, daily_reminder_sent_at, final_reminder_sent_at",
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
  const startsAt = new Date(meeting.starts_at);
  const closesAt = new Date(meeting.attendance_closes_at);

  if (now.getTime() > closesAt.getTime()) {
    throw new Error("Attendance has already closed for this meeting.");
  }

  const status = resolveMeetingAttendanceStatus({
    markedAt: now,
    startsAt,
  });
  const chargeCopy = status === "late" ? buildChargeCopy("late") : null;

  const { data: attendanceRecord, error: attendanceError } = await admin
    .from("meeting_attendance")
    .upsert(
      {
        meeting_id: meetingId,
        member_id: memberId,
        status,
        marked_at: now.toISOString(),
        charge_amount: chargeCopy?.amount ?? 0,
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

  if (chargeCopy) {
    await admin.from("member_charges").upsert(
      {
        amount: chargeCopy.amount,
        created_by: meeting.created_by,
        description: `${chargeCopy.description} Meeting: ${meeting.title}.`,
        due_at: meeting.attendance_closes_at,
        member_id: memberId,
        source_id: meetingId,
        source_type: chargeCopy.sourceType,
        title: chargeCopy.title,
      },
      {
        onConflict: "member_id,source_type,source_id",
      },
    );
  }

  return status;
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
      .select("id, member_id, status, marked_at")
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

    const chargeCopy = buildChargeCopy("absent");

    await admin.from("meeting_attendance").insert({
      meeting_id: meetingId,
      member_id: member.id,
      status: "absent",
      charge_amount: chargeCopy.amount,
    });

    await admin.from("member_charges").upsert(
      {
        amount: chargeCopy.amount,
        created_by: closedBy,
        description: `${chargeCopy.description} Meeting: ${meeting.title}.`,
        due_at: meeting.attendance_closes_at,
        member_id: member.id,
        source_id: meetingId,
        source_type: chargeCopy.sourceType,
        title: chargeCopy.title,
      },
      {
        onConflict: "member_id,source_type,source_id",
      },
    );

    absentNotifications.push({
      actionUrl: "/portal/governance",
      contextLabel: `Attendance charge for ${member.id}`,
      emailSubject: "Meeting attendance charge - Ifemelunma Multi-Purpose Co-operative Society",
      memberId: member.id,
      message: `You were marked absent for ${meeting.title}. A charge of NGN ${chargeCopy.amount.toLocaleString("en-NG")} has been added to your dashboard.`,
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
      "id, title, agenda, location, starts_at, attendance_closes_at, reminder_message, status, created_by, daily_reminder_sent_at, final_reminder_sent_at",
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
      "id, title, agenda, location, starts_at, attendance_closes_at, reminder_message, status, created_by, daily_reminder_sent_at, final_reminder_sent_at",
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
        ).format(new Date(meeting.starts_at))}.${meeting.location ? ` Location: ${meeting.location}.` : ""} ${meeting.reminder_message ?? ""}`.trim(),
        title: prefix,
        type: "meeting_update",
      })),
    );

    await admin
      .from("meetings")
      .update({
        daily_reminder_sent_at: shouldSendDaily ? nowIso : meeting.daily_reminder_sent_at,
        final_reminder_sent_at: shouldSendFinal ? nowIso : meeting.final_reminder_sent_at,
        updated_at: nowIso,
      })
      .eq("id", meeting.id);

    if (warnings.length > 0) {
      console.warn("Meeting reminder warnings", warnings);
    }
  }
}
