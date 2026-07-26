import { redirect } from "next/navigation";
import PortalNotificationsPageView from "@/features/portal/notifications/page-view";
import {
  isNotificationType,
  type MemberNotification,
  type NotificationType,
} from "@/lib/notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

export default async function PortalNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    type?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/portal/notifications");
  }

  const selectedType =
    typeof resolvedSearchParams?.type === "string" &&
    isNotificationType(resolvedSearchParams.type)
      ? resolvedSearchParams.type
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

  return (
    <PortalNotificationsPageView
      initialNotifications={
        ((notifications as NotificationRecord[] | null) ?? []).map(
          mapNotificationRecord,
        )
      }
      initialUnreadCount={unreadCount ?? 0}
      selectedType={selectedType}
      userId={user.id}
    />
  );
}
