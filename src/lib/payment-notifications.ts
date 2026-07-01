import "server-only";

import {
  getAfricasTalkingApiKey,
  getAfricasTalkingBaseUrl,
  getAfricasTalkingSenderId,
  getAfricasTalkingUsername,
  getAppUrl,
  getResendApiKey,
  getResendFromEmail,
} from "@/lib/env/server";
import {
  formatPaymentAmount,
  formatPaymentTypeLabel,
  type PaymentType,
} from "@/lib/payments";

function buildPortalUrl() {
  const appUrl = getAppUrl() ?? "http://localhost:3000";
  return `${appUrl.replace(/\/$/, "")}/portal`;
}

async function sendSmsNotification({
  message,
  phoneNumber,
}: {
  message: string;
  phoneNumber: string | null;
}) {
  if (!phoneNumber) {
    return "This member does not have a phone number on file, so SMS was skipped.";
  }

  const apiKey = getAfricasTalkingApiKey();
  const senderId = getAfricasTalkingSenderId();
  const username = getAfricasTalkingUsername();

  if (!apiKey || !senderId || !username) {
    return "Africa's Talking credentials are missing, so SMS was skipped.";
  }

  const endpoint = `${getAfricasTalkingBaseUrl().replace(/\/$/, "")}/version1/messaging/bulk`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      apiKey,
    },
    body: JSON.stringify({
      message,
      phoneNumbers: [phoneNumber],
      senderId,
      username,
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
    return (
      payload?.errorMessage ??
      payload?.SMSMessageData?.Message ??
      "Africa's Talking rejected the SMS request."
    );
  }

  return null;
}

async function sendEmailNotification({
  amount,
  detail,
  email,
  fullName,
  paymentType,
  reference,
}: {
  amount: number;
  detail: string;
  email: string;
  fullName: string;
  paymentType: PaymentType;
  reference: string;
}) {
  const apiKey = getResendApiKey();
  const from = getResendFromEmail();

  if (!apiKey || !from) {
    return "Resend credentials are missing, so email was skipped.";
  }

  const portalUrl = buildPortalUrl();
  const paymentLabel = formatPaymentTypeLabel(paymentType);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${paymentLabel} confirmed - Ifemelumma Cooperative Society`,
      html: `
        <p>Hello ${fullName},</p>
        <p>Your <strong>${paymentLabel.toLowerCase()}</strong> has been confirmed.</p>
        <p>Amount: <strong>${formatPaymentAmount(amount)}</strong><br />Reference: <strong>${reference}</strong><br />Details: <strong>${detail}</strong></p>
        <p>You can sign in to the member portal for the latest balances and activity.</p>
        <p><a href="${portalUrl}">${portalUrl}</a></p>
      `,
      text: [
        `Hello ${fullName},`,
        `Your ${paymentLabel.toLowerCase()} has been confirmed.`,
        `Amount: ${formatPaymentAmount(amount)}`,
        `Reference: ${reference}`,
        `Details: ${detail}`,
        `Review the latest activity in the member portal: ${portalUrl}`,
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

export async function sendMemberPaymentConfirmation({
  amount,
  detail,
  email,
  fullName,
  paymentType,
  phoneNumber,
  reference,
}: {
  amount: number;
  detail: string;
  email: string;
  fullName: string;
  paymentType: PaymentType;
  phoneNumber: string | null;
  reference: string;
}) {
  const paymentLabel = formatPaymentTypeLabel(paymentType);
  const smsMessage = [
    `${paymentLabel} confirmed by Ifemelumma Cooperative Society.`,
    `Amount: ${formatPaymentAmount(amount)}.`,
    `Reference: ${reference}.`,
  ].join(" ");

  const [smsWarning, emailWarning] = await Promise.all([
    sendSmsNotification({
      message: smsMessage,
      phoneNumber,
    }),
    sendEmailNotification({
      amount,
      detail,
      email,
      fullName,
      paymentType,
      reference,
    }),
  ]);

  return [smsWarning, emailWarning].filter(
    (warning): warning is string => Boolean(warning),
  );
}
