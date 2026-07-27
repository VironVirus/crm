"use client";

import type { ComponentProps } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import PortalNotificationsPageView from "@/features/portal/notifications/page-view";
import {
  StaticPageError,
  StaticPageLoading,
  useStaticPageData,
} from "@/components/static/static-page-state";
import {
  isNotificationType,
  type MemberNotification,
  type NotificationType,
} from "@/lib/notifications";

type NotificationRecord = {
  created_at: string;
  id: string;
  is_read: boolean;
  member_id: string;
  message: string;
  title: string;
  type: NotificationType;
};

function mapNotificationRecord(record: NotificationRecord): MemberNotification {
  return {
    createdAt: record.created_at,
    id: record.id,
    isRead: record.is_read,
    memberId: record.member_id,
    message: record.message,
    title: record.title,
    type: record.type,
  };
}

async function loadPortalNotificationsPage(
  supabase: SupabaseClient,
  user: User,
): Promise<ComponentProps<typeof PortalNotificationsPageView>> {
  const selectedTypeValue = new URLSearchParams(window.location.search).get("type");
  const selectedType =
    selectedTypeValue && isNotificationType(selectedTypeValue)
      ? selectedTypeValue
      : null;

  let notificationsQuery = supabase
    .from("notifications")
    .select("id, member_id, type, title, message, is_read, created_at")
    .eq("member_id", user.id)
    .order("created_at", { ascending: false });

  if (selectedType) {
    notificationsQuery = notificationsQuery.eq("type", selectedType);
  }

  const [{ data: notifications }, { count: unreadCount }] = await Promise.all([
    notificationsQuery,
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("member_id", user.id)
      .eq("is_read", false),
  ]);

  return {
    initialNotifications:
      ((notifications as NotificationRecord[] | null) ?? []).map(
        mapNotificationRecord,
      ),
    initialUnreadCount: unreadCount ?? 0,
    selectedType,
    userId: user.id,
  };
}

export default function PortalNotificationsPage() {
  const { data, error, isLoading } = useStaticPageData(loadPortalNotificationsPage);

  if (isLoading && !data) return <StaticPageLoading label="Loading notifications…" />;
  if (!data) return <StaticPageError>{error ?? "Notifications are unavailable."}</StaticPageError>;

  return <PortalNotificationsPageView {...data} />;
}
