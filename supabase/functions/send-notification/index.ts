import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const NOTIFICATION_TYPES = [
  "loan_approved",
  "loan_rejected",
  "payment_received",
  "guarantor_invite",
  "due_reminder",
  "dividend_paid",
] as const;

type NotificationType = (typeof NOTIFICATION_TYPES)[number];

type SendNotificationPayload = {
  actionUrl?: string;
  emailSubject?: string;
  memberId?: string;
  message?: string;
  title?: string;
  type?: NotificationType;
};

type ProfileRecord = {
  email: string;
  full_name: string;
  phone: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function isNotificationType(value: string | undefined): value is NotificationType {
  return NOTIFICATION_TYPES.includes(value as NotificationType);
}

function buildActionUrl(appUrl: string | null, actionUrl: string | undefined) {
  if (actionUrl?.startsWith("http://") || actionUrl?.startsWith("https://")) {
    return actionUrl;
  }

  const baseUrl = (appUrl ?? "http://localhost:3000").replace(/\/$/, "");
  const normalizedPath = actionUrl?.trim() ? actionUrl : "/portal";

  return `${baseUrl}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

function buildSmsMessage({
  actionUrl,
  message,
  title,
}: {
  actionUrl: string;
  message: string;
  title: string;
}) {
  return [
    `Ifemelumma Cooperative Society: ${title}.`,
    message,
    `Open your portal: ${actionUrl}`,
  ].join(" ");
}

function buildEmailHtml({
  actionUrl,
  fullName,
  message,
  title,
}: {
  actionUrl: string;
  fullName: string;
  message: string;
  title: string;
}) {
  return `
    <div style="margin:0;background:#08111d;padding:32px 16px;font-family:Inter,Segoe UI,sans-serif;color:#dbe7f3;">
      <div style="margin:0 auto;max-width:640px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);border-radius:28px;background:linear-gradient(180deg,#0d1a2b 0%,#0a1220 100%);box-shadow:0 24px 60px rgba(0,0,0,0.28);">
        <div style="padding:32px;background:radial-gradient(circle at top right, rgba(16,185,129,0.22), transparent 38%), linear-gradient(135deg, rgba(245,158,11,0.16), rgba(16,185,129,0.08));border-bottom:1px solid rgba(255,255,255,0.08);">
          <div style="display:inline-block;padding:8px 12px;border-radius:999px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.2);font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#fde68a;">
            Ifemelumma Cooperative Society
          </div>
          <h1 style="margin:18px 0 8px;font-size:28px;line-height:1.2;color:#ffffff;">${title}</h1>
          <p style="margin:0;font-size:15px;line-height:1.8;color:#cbd5e1;">
            Hello ${fullName},
          </p>
        </div>
        <div style="padding:32px;">
          <div style="padding:20px 22px;border-radius:22px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);font-size:15px;line-height:1.8;color:#e2e8f0;">
            ${message}
          </div>
          <div style="margin-top:24px;">
            <a href="${actionUrl}" style="display:inline-block;padding:14px 20px;border-radius:18px;background:#10b981;color:#041018;text-decoration:none;font-weight:700;">
              Open member portal
            </a>
          </div>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.8;color:#94a3b8;">
            Stay close to your savings, loans, dividends, and member responsibilities from your secure cooperative dashboard.
          </p>
        </div>
      </div>
    </div>
  `;
}

async function insertNotificationRecord({
  memberId,
  message,
  supabase,
  title,
  type,
}: {
  memberId: string;
  message: string;
  supabase: ReturnType<typeof createClient>;
  title: string;
  type: NotificationType;
}) {
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      member_id: memberId,
      message,
      title,
      type,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Notification record could not be created.",
    };
  }

  return {
    ok: true,
    id: data.id as string,
  };
}

async function sendSmsNotification({
  apiKey,
  baseUrl,
  message,
  phoneNumber,
  senderId,
  username,
}: {
  apiKey: string | null;
  baseUrl: string | null;
  message: string;
  phoneNumber: string | null;
  senderId: string | null;
  username: string | null;
}) {
  if (!phoneNumber) {
    return {
      sent: false,
      warning: "The member has no phone number on file, so SMS was skipped.",
    };
  }

  if (!apiKey || !senderId || !username) {
    return {
      sent: false,
      warning: "Africa's Talking credentials are missing, so SMS was skipped.",
    };
  }

  const endpoint = `${(baseUrl ?? "https://api.africastalking.com").replace(/\/$/, "")}/version1/messaging/bulk`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      apiKey,
    },
    body: JSON.stringify({
      username,
      phoneNumbers: [phoneNumber],
      message,
      senderId,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        SMSMessageData?: {
          Message?: string;
        };
        errorMessage?: string;
      }
    | null;

  if (!response.ok) {
    return {
      sent: false,
      warning:
        payload?.errorMessage ??
        payload?.SMSMessageData?.Message ??
        "Africa's Talking rejected the SMS request.",
    };
  }

  return {
    sent: true,
    warning: null,
  };
}

async function sendEmailNotification({
  actionUrl,
  apiKey,
  email,
  emailSubject,
  from,
  fullName,
  message,
  title,
}: {
  actionUrl: string;
  apiKey: string | null;
  email: string;
  emailSubject: string;
  from: string | null;
  fullName: string;
  message: string;
  title: string;
}) {
  if (!apiKey || !from) {
    return {
      sent: false,
      warning: "Resend credentials are missing, so email was skipped.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: emailSubject,
      html: buildEmailHtml({
        actionUrl,
        fullName,
        message,
        title,
      }),
      text: [
        `Hello ${fullName},`,
        title,
        message,
        `Open your member portal: ${actionUrl}`,
      ].join("\n"),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | null;

  if (!response.ok) {
    return {
      sent: false,
      warning: payload?.message ?? "Resend rejected the email request.",
    };
  }

  return {
    sent: true,
    warning: null,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json(
      { error: "Supabase environment variables are missing." },
      500,
    );
  }

  let payload: SendNotificationPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON payload." }, 400);
  }

  const memberId = payload.memberId?.trim();
  const title = payload.title?.trim();
  const message = payload.message?.trim();

  if (!memberId || !title || !message || !isNotificationType(payload.type)) {
    return json(
      {
        error:
          "memberId, type, title, and message are required, and type must be valid.",
      },
      400,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, email, phone")
    .eq("id", memberId)
    .maybeSingle();

  if (profileError || !profile) {
    return json({ error: "Member profile not found." }, 404);
  }

  const profileRecord = profile as ProfileRecord;
  const actionUrl = buildActionUrl(Deno.env.get("APP_URL"), payload.actionUrl);
  const emailSubject =
    payload.emailSubject?.trim() ||
    `${title} - Ifemelumma Cooperative Society`;
  const smsMessage = buildSmsMessage({
    actionUrl,
    message,
    title,
  });

  const [notificationResult, smsResult, emailResult] = await Promise.all([
    insertNotificationRecord({
      memberId,
      message,
      supabase,
      title,
      type: payload.type,
    }),
    sendSmsNotification({
      apiKey: Deno.env.get("AFRICASTALKING_API_KEY"),
      baseUrl: Deno.env.get("AFRICASTALKING_BASE_URL"),
      message: smsMessage,
      phoneNumber: profileRecord.phone,
      senderId: Deno.env.get("AFRICASTALKING_SENDER_ID"),
      username: Deno.env.get("AFRICASTALKING_USERNAME"),
    }),
    sendEmailNotification({
      actionUrl,
      apiKey: Deno.env.get("RESEND_API_KEY"),
      email: profileRecord.email,
      emailSubject,
      from: Deno.env.get("RESEND_FROM_EMAIL"),
      fullName: profileRecord.full_name,
      message,
      title,
    }),
  ]);

  if (!notificationResult.ok) {
    return json(
      {
        error: notificationResult.error,
        warnings: [smsResult.warning, emailResult.warning].filter(Boolean),
      },
      500,
    );
  }

  return json(
    {
      emailSent: emailResult.sent,
      notificationId: notificationResult.id,
      smsSent: smsResult.sent,
      warnings: [smsResult.warning, emailResult.warning].filter(Boolean),
    },
    201,
  );
});
