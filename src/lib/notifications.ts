export const NOTIFICATION_TYPES = [
  "loan_approved",
  "loan_rejected",
  "payment_received",
  "guarantor_invite",
  "due_reminder",
  "dividend_paid",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type MemberNotification = {
  id: string;
  memberId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

const notificationDateFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

export function isNotificationType(value: string): value is NotificationType {
  return NOTIFICATION_TYPES.includes(value as NotificationType);
}

export function formatNotificationTypeLabel(value: NotificationType) {
  switch (value) {
    case "loan_approved":
      return "Loan approved";
    case "loan_rejected":
      return "Loan rejected";
    case "payment_received":
      return "Payment received";
    case "guarantor_invite":
      return "Guarantor invite";
    case "due_reminder":
      return "Due reminder";
    case "dividend_paid":
      return "Dividend paid";
    default:
      return value;
  }
}

export function formatNotificationTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return notificationDateFormatter.format(date);
}

export function formatNotificationRelativeTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (1000 * 60));

  if (Math.abs(diffMinutes) < 60) {
    return relativeTimeFormatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (Math.abs(diffHours) < 24) {
    return relativeTimeFormatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);

  if (Math.abs(diffDays) < 30) {
    return relativeTimeFormatter.format(diffDays, "day");
  }

  return formatNotificationTimestamp(value);
}

export function getNotificationTone(value: NotificationType) {
  switch (value) {
    case "loan_approved":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "loan_rejected":
      return "border-rose-400/25 bg-rose-500/10 text-rose-100";
    case "payment_received":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "guarantor_invite":
      return "border-amber-300/25 bg-amber-400/10 text-amber-100";
    case "due_reminder":
      return "border-orange-300/25 bg-orange-400/10 text-orange-100";
    case "dividend_paid":
      return "border-fuchsia-300/25 bg-fuchsia-500/10 text-fuchsia-100";
    default:
      return "border-white/10 bg-white/5 text-slate-100";
  }
}
