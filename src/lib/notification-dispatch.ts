import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type NotificationType } from "@/lib/notifications";

type SendNotificationFunctionResult = {
  error?: string;
  notificationId?: string;
  warnings?: string[];
};

type NotificationDispatchRequest = {
  actionUrl?: string;
  contextLabel?: string;
  emailSubject?: string;
  memberId: string;
  message: string;
  title: string;
  type: NotificationType;
};

type NotificationDispatchResult = {
  ok: boolean;
  warnings: string[];
};

function normalizeWarnings(
  label: string,
  warnings: string[],
  fallbackMessage: string,
) {
  const filteredWarnings = warnings.filter(Boolean);

  if (filteredWarnings.length > 0) {
    return filteredWarnings.map((warning) => `${label}: ${warning}`);
  }

  return [`${label}: ${fallbackMessage}`];
}

export async function sendMemberNotification(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  request: NotificationDispatchRequest,
): Promise<NotificationDispatchResult> {
  try {
    const result = await admin.functions.invoke("send-notification", {
      body: {
        actionUrl: request.actionUrl,
        emailSubject: request.emailSubject,
        memberId: request.memberId,
        message: request.message,
        title: request.title,
        type: request.type,
      },
    });
    const data = (result.data as SendNotificationFunctionResult | null) ?? null;
    const label = request.contextLabel ?? request.title;

    if (result.error || data?.error) {
      return {
        ok: false,
        warnings: normalizeWarnings(
          label,
          [data?.error ?? result.error?.message ?? ""],
          "Notification delivery could not be completed.",
        ),
      };
    }

    return {
      ok: true,
      warnings: (data?.warnings ?? [])
        .filter(Boolean)
        .map((warning) => `${label}: ${warning}`),
    };
  } catch (error) {
    const label = request.contextLabel ?? request.title;

    return {
      ok: false,
      warnings: normalizeWarnings(
        label,
        [error instanceof Error ? error.message : ""],
        "Notification delivery could not be completed.",
      ),
    };
  }
}

export async function sendBatchMemberNotifications(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  requests: NotificationDispatchRequest[],
  batchSize = 10,
) {
  const warnings: string[] = [];

  for (let index = 0; index < requests.length; index += batchSize) {
    const batch = requests.slice(index, index + batchSize);
    const results = await Promise.all(
      batch.map((request) => sendMemberNotification(admin, request)),
    );

    results.forEach((result) => {
      warnings.push(...result.warnings);
    });
  }

  return warnings;
}
