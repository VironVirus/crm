import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type InviteGuarantorPayload = {
  loanApplicationId?: string;
  guarantorMemberId?: string;
  liabilityAmount?: number | string | null;
};

type LoanApplicationRecord = {
  id: string;
  member_id: string;
  loan_product_id: string;
  amount_requested: number | string | null;
  tenure_months: number;
};

type ProfileRecord = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  member_number: string | null;
  status: "active" | "inactive" | "suspended";
};

type MemberRecord = {
  id: string;
  onboarding_status: "pending" | "registered";
};

type LoanProductRecord = {
  name: string;
};

type LoanGuarantorRecord = {
  loan_application_id: string;
};

type LoanRecord = {
  application_id: string;
};

type SendNotificationResult = {
  emailSent?: boolean;
  error?: string;
  notificationId?: string;
  smsSent?: boolean;
  warnings?: string[];
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function parseMoney(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
});

function formatNaira(value: number) {
  return nairaFormatter.format(value);
}

function buildPortalUrl(appUrl: string | null) {
  if (!appUrl) {
    return "/portal";
  }

  return `${appUrl.replace(/\/$/, "")}/portal`;
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
      warning: "Guarantor has no phone number on file for SMS delivery.",
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
  apiKey,
  applicantName,
  appUrl,
  email,
  from,
  liabilityAmount,
  loanAmount,
  loanProductName,
  tenureMonths,
}: {
  apiKey: string | null;
  applicantName: string;
  appUrl: string | null;
  email: string;
  from: string | null;
  liabilityAmount: number;
  loanAmount: number;
  loanProductName: string;
  tenureMonths: number;
}) {
  if (!apiKey || !from) {
    return {
      sent: false,
      warning: "Resend credentials are missing, so email was skipped.",
    };
  }

  const portalUrl = buildPortalUrl(appUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Guarantor request from Ifemelumma Cooperative Society",
      html: `
        <p>Hello,</p>
        <p><strong>${applicantName}</strong> has listed you as a guarantor for a <strong>${loanProductName}</strong> loan request.</p>
        <p>Loan amount: <strong>${formatNaira(loanAmount)}</strong><br />Tenure: <strong>${tenureMonths} months</strong><br />Your liability share: <strong>${formatNaira(liabilityAmount)}</strong></p>
        <p>Please sign in to the member portal to accept or decline this guarantor request.</p>
        <p><a href="${portalUrl}">${portalUrl}</a></p>
      `,
      text: [
        "Hello,",
        `${applicantName} has listed you as a guarantor for a ${loanProductName} loan request.`,
        `Loan amount: ${formatNaira(loanAmount)}`,
        `Tenure: ${tenureMonths} months`,
        `Your liability share: ${formatNaira(liabilityAmount)}`,
        `Review the request in the member portal: ${portalUrl}`,
      ].join("\n"),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
        id?: string;
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

  let payload: InviteGuarantorPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON payload." }, 400);
  }

  if (!payload.loanApplicationId || !payload.guarantorMemberId) {
    return json(
      { error: "loanApplicationId and guarantorMemberId are required." },
      400,
    );
  }

  const liabilityAmount = parseMoney(payload.liabilityAmount);

  if (liabilityAmount <= 0) {
    return json({ error: "liabilityAmount must be greater than zero." }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: application, error: applicationError } = await supabase
    .from("loan_applications")
    .select("id, member_id, loan_product_id, amount_requested, tenure_months")
    .eq("id", payload.loanApplicationId)
    .maybeSingle();

  if (applicationError || !application) {
    return json({ error: "Loan application not found." }, 404);
  }

  const loanApplication = application as LoanApplicationRecord;

  if (loanApplication.member_id === payload.guarantorMemberId) {
    return json(
      { error: "A member cannot act as guarantor on their own application." },
      400,
    );
  }

  const [
    { data: applicantProfile, error: applicantProfileError },
    { data: guarantorProfile, error: guarantorProfileError },
    { data: guarantorMember, error: guarantorMemberError },
    { data: loanProduct, error: loanProductError },
    { data: duplicateInvite, error: duplicateInviteError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, member_number, status")
      .eq("id", loanApplication.member_id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, member_number, status")
      .eq("id", payload.guarantorMemberId)
      .maybeSingle(),
    supabase
      .from("members")
      .select("id, onboarding_status")
      .eq("id", payload.guarantorMemberId)
      .maybeSingle(),
    supabase
      .from("loan_products")
      .select("name")
      .eq("id", loanApplication.loan_product_id)
      .maybeSingle(),
    supabase
      .from("loan_guarantors")
      .select("loan_application_id")
      .eq("loan_application_id", payload.loanApplicationId)
      .eq("guarantor_member_id", payload.guarantorMemberId)
      .maybeSingle(),
  ]);

  if (applicantProfileError || !applicantProfile) {
    return json({ error: "Applicant profile could not be found." }, 404);
  }

  if (guarantorProfileError || !guarantorProfile) {
    return json({ error: "Guarantor profile could not be found." }, 404);
  }

  if (guarantorMemberError || !guarantorMember) {
    return json({ error: "Guarantor member record could not be found." }, 404);
  }

  if (loanProductError || !loanProduct) {
    return json({ error: "Loan product attached to this request was not found." }, 404);
  }

  if (duplicateInviteError) {
    return json({ error: "Unable to verify duplicate guarantor requests." }, 500);
  }

  if (duplicateInvite) {
    return json(
      { error: "This member has already been added as guarantor on the application." },
      409,
    );
  }

  const guarantorProfileRecord = guarantorProfile as ProfileRecord;
  const guarantorMemberRecord = guarantorMember as MemberRecord;

  if (guarantorProfileRecord.status !== "active") {
    return json(
      { error: "Only active members in good standing can act as guarantors." },
      400,
    );
  }

  if (guarantorMemberRecord.onboarding_status !== "registered") {
    return json(
      { error: "Only fully registered members can act as guarantors." },
      400,
    );
  }

  const { data: acceptedGuarantees, error: acceptedGuaranteesError } = await supabase
    .from("loan_guarantors")
    .select("loan_application_id")
    .eq("guarantor_member_id", payload.guarantorMemberId)
    .eq("status", "accepted")
    .is("released_at", null);

  if (acceptedGuaranteesError) {
    return json(
      { error: "Unable to verify the guarantor's active obligations." },
      500,
    );
  }

  const guaranteedApplicationIds = (
    (acceptedGuarantees as LoanGuarantorRecord[] | null) ?? []
  ).map((record) => record.loan_application_id);

  let activeGuaranteedLoansCount = 0;

  if (guaranteedApplicationIds.length > 0) {
    const { data: activeLoans, error: activeLoansError } = await supabase
      .from("loans")
      .select("application_id")
      .in("application_id", guaranteedApplicationIds)
      .in("status", ["active", "defaulted"]);

    if (activeLoansError) {
      return json(
        { error: "Unable to count the guarantor's active guaranteed loans." },
        500,
      );
    }

    activeGuaranteedLoansCount = (
      (activeLoans as LoanRecord[] | null) ?? []
    ).length;
  }

  if (activeGuaranteedLoansCount >= 2) {
    return json(
      {
        error:
          "This member is already guaranteeing 2 active loans and cannot accept another one right now.",
      },
      400,
    );
  }

  const { data: invitationRecord, error: invitationError } = await supabase
    .from("loan_guarantors")
    .insert({
      loan_application_id: payload.loanApplicationId,
      guarantor_member_id: payload.guarantorMemberId,
      liability_amount: liabilityAmount,
      status: "invited",
    })
    .select("id")
    .single();

  if (invitationError || !invitationRecord) {
    return json(
      {
        error:
          invitationError?.message ??
          "Unable to create the guarantor invitation record.",
      },
      500,
    );
  }

  const loanAmount = parseMoney(loanApplication.amount_requested);
  const applicantProfileRecord = applicantProfile as ProfileRecord;
  const loanProductRecord = loanProduct as LoanProductRecord;
  const actionUrl = buildPortalUrl(Deno.env.get("APP_URL"));
  const notificationResponse = await fetch(
    `${supabaseUrl}/functions/v1/send-notification`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actionUrl,
        emailSubject: "Guarantor request from Ifemelumma Cooperative Society",
        memberId: payload.guarantorMemberId,
        message: [
          `${applicantProfileRecord.full_name} listed you as a guarantor for ${loanProductRecord.name}.`,
          `Loan amount: ${formatNaira(loanAmount)}.`,
          `Tenure: ${loanApplication.tenure_months} months.`,
          `Liability share: ${formatNaira(liabilityAmount)}.`,
          "Sign in to review and respond from your member portal.",
        ].join(" "),
        title: "New guarantor request",
        type: "guarantor_invite",
      }),
    },
  );
  const notificationPayload =
    (await notificationResponse.json().catch(() => null)) as
      | SendNotificationResult
      | null;
  const warnings = notificationResponse.ok
    ? (notificationPayload?.warnings ?? []).filter(Boolean)
    : [
        notificationPayload?.error ??
          "The guarantor invitation was saved, but the notification could not be delivered.",
      ];

  return json(
    {
      invitationId: invitationRecord.id,
      smsSent: notificationPayload?.smsSent ?? false,
      emailSent: notificationPayload?.emailSent ?? false,
      warnings,
    },
    201,
  );
});
