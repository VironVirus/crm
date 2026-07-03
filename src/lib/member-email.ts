import "server-only";

import { COOPERATIVE_NAME } from "@/lib/brand";
import { getAppUrl, getResendApiKey, getResendFromEmail } from "@/lib/env/server";

function buildActionUrl(path: string) {
  const baseUrl = (getAppUrl() ?? "http://localhost:3000").replace(/\/$/, "");
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function buildEmailHtml({
  actionLabel,
  actionUrl,
  fullName,
  message,
  title,
}: {
  actionLabel: string;
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
            ${COOPERATIVE_NAME}
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
              ${actionLabel}
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function sendMemberEmail({
  actionLabel = "Open member portal",
  actionPath = "/portal",
  email,
  fullName,
  message,
  subject,
  title,
}: {
  actionLabel?: string;
  actionPath?: string;
  email: string;
  fullName: string;
  message: string;
  subject: string;
  title: string;
}) {
  const apiKey = getResendApiKey();
  const from = getResendFromEmail();

  if (!apiKey || !from) {
    return "Resend credentials are missing, so email was skipped.";
  }

  const actionUrl = buildActionUrl(actionPath);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      html: buildEmailHtml({
        actionLabel,
        actionUrl,
        fullName,
        message,
        title,
      }),
      text: [
        `Hello ${fullName},`,
        message,
        `${actionLabel}: ${actionUrl}`,
      ].join("\n"),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | null;

  if (!response.ok) {
    return payload?.message ?? "Resend rejected the email request.";
  }

  return null;
}
