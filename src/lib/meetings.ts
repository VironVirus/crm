export const MEETING_STATUSES = ["scheduled", "closed", "cancelled"] as const;
export const MEETING_ATTENDANCE_STATUSES = [
  "present",
  "late",
  "absent",
] as const;
export const MEMBER_CHARGE_STATUSES = ["pending", "waived", "paid"] as const;
export const MEMBER_CHARGE_SOURCE_TYPES = [
  "meeting_late",
  "meeting_absence",
  "manual",
] as const;

export const MEETING_LATE_FEE = 1000;
export const MEETING_ABSENT_FEE = 2000;

export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export type MeetingAttendanceStatus =
  (typeof MEETING_ATTENDANCE_STATUSES)[number];
export type MemberChargeStatus = (typeof MEMBER_CHARGE_STATUSES)[number];
export type MemberChargeSourceType = (typeof MEMBER_CHARGE_SOURCE_TYPES)[number];

export type MeetingRow = {
  id: string;
  title: string;
  agenda: string | null;
  location: string | null;
  startsAt: string;
  attendanceClosesAt: string;
  reminderMessage: string | null;
  status: MeetingStatus;
  createdAt: string;
};

export type MeetingAttendanceRow = {
  id: string;
  meetingId: string;
  memberId: string;
  status: MeetingAttendanceStatus;
  markedAt: string | null;
  chargeAmount: number;
};

export type MemberChargeRow = {
  id: string;
  memberId: string;
  sourceType: MemberChargeSourceType;
  sourceId: string | null;
  status: MemberChargeStatus;
  amount: number;
  title: string;
  description: string | null;
  dueAt: string | null;
  createdAt: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatMeetingDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return dateTimeFormatter.format(date);
}

export function getMeetingStatusLabel(value: MeetingStatus) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getMeetingStatusTone(value: MeetingStatus) {
  switch (value) {
    case "closed":
      return "border-slate-300/30 bg-slate-400/10 text-slate-700 dark:text-slate-100";
    case "cancelled":
      return "border-rose-300/30 bg-rose-500/10 text-rose-700 dark:text-rose-100";
    case "scheduled":
    default:
      return "border-emerald-300/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100";
  }
}

export function getAttendanceStatusLabel(value: MeetingAttendanceStatus) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getAttendanceStatusTone(value: MeetingAttendanceStatus) {
  switch (value) {
    case "late":
      return "border-amber-300/30 bg-amber-400/10 text-amber-800 dark:text-amber-100";
    case "absent":
      return "border-rose-300/30 bg-rose-500/10 text-rose-700 dark:text-rose-100";
    case "present":
    default:
      return "border-emerald-300/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100";
  }
}

export function resolveMeetingAttendanceStatus({
  markedAt,
  startsAt,
}: {
  markedAt: Date;
  startsAt: Date;
}): MeetingAttendanceStatus {
  return markedAt.getTime() > startsAt.getTime() ? "late" : "present";
}

export function canMemberMarkAttendance({
  attendanceClosesAt,
  startsAt,
  status,
}: {
  attendanceClosesAt: string;
  startsAt: string;
  status: MeetingStatus;
}) {
  if (status !== "scheduled") {
    return false;
  }

  const now = Date.now();
  const startsAtTime = new Date(startsAt).getTime();
  const closesAtTime = new Date(attendanceClosesAt).getTime();

  if (!Number.isFinite(startsAtTime) || !Number.isFinite(closesAtTime)) {
    return false;
  }

  return now >= startsAtTime - 60 * 60 * 1000 && now <= closesAtTime;
}
