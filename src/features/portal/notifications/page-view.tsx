"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BellRing, CheckCheck, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createBrowserSupabaseClient,
} from "@/lib/supabase/client";
import {
  formatNotificationRelativeTime,
  formatNotificationTimestamp,
  formatNotificationTypeLabel,
  getNotificationTone,
  NOTIFICATION_TYPES,
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

export default function PortalNotificationsPageView({
  initialNotifications,
  initialUnreadCount,
  selectedType,
  userId,
}: {
  initialNotifications: MemberNotification[];
  initialUnreadCount: number;
  selectedType: NotificationType | null;
  userId: string;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const supabaseRef = useRef(createBrowserSupabaseClient());

  useEffect(() => {
    setNotifications(initialNotifications);
    setUnreadCount(initialUnreadCount);
  }, [initialNotifications, initialUnreadCount]);

  useEffect(() => {
    async function loadNotifications() {
      setIsRefreshing(true);

      let notificationsQuery = supabaseRef.current
        .from("notifications")
        .select("id, member_id, type, title, message, is_read, created_at")
        .eq("member_id", userId)
        .order("created_at", { ascending: false });

      if (selectedType) {
        notificationsQuery = notificationsQuery.eq("type", selectedType);
      }

      const [{ data: rows, error: notificationsError }, { count, error: countError }] =
        await Promise.all([
          notificationsQuery,
          supabaseRef.current
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("member_id", userId)
            .eq("is_read", false),
        ]);

      if (!notificationsError && rows) {
        setNotifications(
          (rows as NotificationRecord[]).map(mapNotificationRecord),
        );
      }

      if (!countError) {
        setUnreadCount(count ?? 0);
      }

      setIsRefreshing(false);
    }

    const channel = supabaseRef.current
      .channel(`member-notification-history:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `member_id=eq.${userId}`,
          schema: "public",
          table: "notifications",
        },
        () => {
          void loadNotifications();
        },
      )
      .subscribe();

    return () => {
      void supabaseRef.current.removeChannel(channel);
    };
  }, [selectedType, userId]);

  async function markAsRead(notification: MemberNotification) {
    if (notification.isRead) {
      return;
    }

    setUpdatingId(notification.id);
    setNotifications((currentNotifications) =>
      currentNotifications.map((currentNotification) =>
        currentNotification.id === notification.id
          ? {
              ...currentNotification,
              isRead: true,
            }
          : currentNotification,
      ),
    );
    setUnreadCount((currentCount) => Math.max(0, currentCount - 1));

    const { error } = await supabaseRef.current
      .from("notifications")
      .update({
        is_read: true,
      })
      .eq("id", notification.id)
      .eq("member_id", userId);

    if (error) {
      setNotifications((currentNotifications) =>
        currentNotifications.map((currentNotification) =>
          currentNotification.id === notification.id
            ? {
                ...currentNotification,
                isRead: false,
              }
            : currentNotification,
        ),
      );
      setUnreadCount((currentCount) => currentCount + 1);
    }

    setUpdatingId(null);
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border bg-card/90 backdrop-blur">
          <CardHeader className="space-y-4">
            <Badge className="w-fit">Member alerts</Badge>
            <CardTitle className="font-['Outfit'] text-3xl text-foreground">
              Notification history
            </CardTitle>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
              Follow approvals, guarantor invites, payment confirmations, due
              reminders, and dividend updates from one live feed.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-border bg-secondary p-4">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <BellRing size={18} />
              </div>
              <p className="text-sm text-muted-foreground">Unread notifications</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {unreadCount}
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-secondary p-4">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-700 dark:text-amber-200">
                <CheckCheck size={18} />
              </div>
              <p className="text-sm text-muted-foreground">Current filter</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {selectedType ? formatNotificationTypeLabel(selectedType) : "All"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-300/10 bg-amber-400/10">
          <CardHeader>
            <Badge variant="outline" className="w-fit">
              Filter feed
            </Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
              Narrow by update type
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link
              className={`rounded-full border px-4 py-2 text-sm transition ${
                selectedType === null
                  ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
              href="/portal/notifications"
            >
              All
            </Link>
            {NOTIFICATION_TYPES.map((type) => (
              <Link
                key={type}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  selectedType === type
                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
                href={`/portal/notifications?type=${type}`}
              >
                {formatNotificationTypeLabel(type)}
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card className="border-border bg-card/90 backdrop-blur">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <Badge variant="secondary" className="w-fit">
              Full feed
            </Badge>
            <CardTitle className="mt-3 font-['Outfit'] text-2xl text-foreground">
              Latest member notifications
            </CardTitle>
          </div>
          {isRefreshing ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Refreshing
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {notifications.length > 0 ? (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`rounded-3xl border px-4 py-4 ${getNotificationTone(
                    notification.type,
                  )}`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                          {formatNotificationTypeLabel(notification.type)}
                        </span>
                        {!notification.isRead ? (
                          <span className="rounded-full border border-emerald-300/30 bg-emerald-400/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-100">
                            Unread
                          </span>
                        ) : null}
                      </div>
                      <p className="text-lg font-semibold text-foreground">
                        {notification.title}
                      </p>
                      <p className="max-w-3xl text-sm leading-7 text-foreground">
                        {notification.message}
                      </p>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>
                          {formatNotificationRelativeTime(notification.createdAt)}
                        </span>
                        <span>
                          {formatNotificationTimestamp(notification.createdAt)}
                        </span>
                      </div>
                    </div>

                    {!notification.isRead ? (
                      <Button
                        className="sm:self-start"
                        disabled={updatingId === notification.id}
                        onClick={() => {
                          void markAsRead(notification);
                        }}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        {updatingId === notification.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving
                          </>
                        ) : (
                          "Mark as read"
                        )}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-secondary px-6 py-12 text-center text-sm leading-7 text-muted-foreground">
              No notifications match this filter yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
