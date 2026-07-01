"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  formatNotificationRelativeTime,
  formatNotificationTypeLabel,
  getNotificationTone,
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

export function NotificationBell({ userId }: { userId: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<MemberNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const supabaseRef = useRef(createBrowserSupabaseClient());

  useEffect(() => {
    async function loadNotifications() {
      const supabase = supabaseRef.current;
      const [{ data: rows, error: notificationsError }, { count, error: countError }] =
        await Promise.all([
          supabase
            .from("notifications")
            .select("id, member_id, type, title, message, is_read, created_at")
            .eq("member_id", userId)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
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

      setIsLoading(false);
    }

    void loadNotifications();

    const channel = supabaseRef.current
      .channel(`member-notifications:${userId}`)
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
  }, [userId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

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
    <div ref={containerRef} className="relative">
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        type="button"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute right-2 top-2 min-w-[1.2rem] rounded-full bg-emerald-400 px-1.5 py-0.5 text-[10px] font-semibold text-slate-950">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-30 mt-3 w-[22rem] overflow-hidden rounded-[28px] border border-white/10 bg-[#08111d]/95 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-amber-300">
                  Notifications
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {unreadCount > 0
                    ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}`
                    : "You are all caught up"}
                </p>
              </div>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : null}
            </div>
          </div>

          <div className="max-h-[28rem] overflow-y-auto px-3 py-3">
            {notifications.length > 0 ? (
              <div className="space-y-2">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    className={`w-full rounded-3xl border px-4 py-4 text-left transition hover:border-emerald-400/25 ${getNotificationTone(
                      notification.type,
                    )} ${notification.isRead ? "opacity-80" : ""}`}
                    onClick={() => {
                      void markAsRead(notification);
                    }}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] uppercase tracking-[0.24em] text-slate-300">
                            {formatNotificationTypeLabel(notification.type)}
                          </span>
                          {!notification.isRead ? (
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                          ) : null}
                        </div>
                        <p className="text-sm font-semibold text-white">
                          {notification.title}
                        </p>
                        <p className="text-sm leading-6 text-slate-200">
                          {notification.message}
                        </p>
                      </div>
                      {updatingId === notification.id ? (
                        <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-slate-300" />
                      ) : (
                        <span className="shrink-0 text-xs text-slate-300">
                          {formatNotificationRelativeTime(notification.createdAt)}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-slate-300">
                New cooperative updates will appear here.
              </div>
            )}
          </div>

          <div className="border-t border-white/10 px-4 py-4">
            <Link
              className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              href="/portal/notifications"
              onClick={() => setIsOpen(false)}
            >
              View all notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
