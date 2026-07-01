import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type ContributionScheduleRecord = {
  due_day: number;
  member_id: string;
  monthly_amount: number | string | null;
};

type ProfileRecord = {
  email: string;
  full_name: string;
  id: string;
  phone: string | null;
  status: "active" | "inactive" | "suspended";
};

type MemberRecord = {
  id: string;
  onboarding_status: "pending" | "registered";
};

type SendNotificationResult = {
  emailSent?: boolean;
  error?: string;
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

function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatOrdinal(day: number) {
  const remainder10 = day % 10;
  const remainder100 = day % 100;

  if (remainder10 === 1 && remainder100 !== 11) {
    return `${day}st`;
  }

  if (remainder10 === 2 && remainder100 !== 12) {
    return `${day}nd`;
  }

  if (remainder10 === 3 && remainder100 !== 13) {
    return `${day}rd`;
  }

  return `${day}th`;
}

function buildPortalUrl(appUrl: string | null) {
  if (!appUrl) {
    return "http://localhost:3000/portal";
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
      warning: "Member has no phone number on file for SMS delivery.",
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
  amount,
  apiKey,
  appUrl,
  dueDay,
  email,
  fullName,
  from,
}: {
  amount: number;
  apiKey: string | null;
  appUrl: string | null;
  dueDay: number;
  email: string;
  fullName: string;
  from: string | null;
}) {
  if (!apiKey || !from) {
    return {
      sent: false,
      warning: "Resend credentials are missing, so email was skipped.",
    };
  }

  const portalUrl = buildPortalUrl(appUrl);
  const dueDayLabel = formatOrdinal(dueDay);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Monthly contribution reminder from Ifemelunma Cooperative Society",
      html: `
        <p>Hello ${fullName},</p>
        <p>Your monthly cooperative contribution of <strong>${formatNaira(amount)}</strong> is due on the <strong>${dueDayLabel}</strong>.</p>
        <p>Please sign in to the member portal to complete your payment on time.</p>
        <p><a href="${portalUrl}">${portalUrl}</a></p>
      `,
      text: [
        `Hello ${fullName},`,
        `Your monthly cooperative contribution of ${formatNaira(amount)} is due on the ${dueDayLabel}.`,
        `Log in to pay: ${portalUrl}`,
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

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: schedules, error: schedulesError } = await supabase
    .from("contribution_schedules")
    .select("member_id, monthly_amount, due_day")
    .eq("is_active", true);

  if (schedulesError) {
    return json({ error: schedulesError.message }, 400);
  }

  const scheduleRows = (schedules as ContributionScheduleRecord[] | null) ?? [];
  const memberIds = Array.from(
    new Set(scheduleRows.map((schedule) => schedule.member_id)),
  );

  if (memberIds.length === 0) {
    return json({
      emailsSent: 0,
      membersConsidered: 0,
      smsSent: 0,
      warnings: [],
    });
  }

  const [{ data: profiles, error: profilesError }, { data: members, error: membersError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, phone, status")
        .in("id", memberIds),
      supabase
        .from("members")
        .select("id, onboarding_status")
        .in("id", memberIds),
    ]);

  if (profilesError) {
    return json({ error: profilesError.message }, 400);
  }

  if (membersError) {
    return json({ error: membersError.message }, 400);
  }

  const profileMap = new Map(
    ((profiles as ProfileRecord[] | null) ?? []).map((profile) => [
      profile.id,
      profile,
    ]),
  );
  const memberMap = new Map(
    ((members as MemberRecord[] | null) ?? []).map((member) => [member.id, member]),
  );

  const aggregatedScheduleMap = scheduleRows.reduce<
    Map<
      string,
      {
        amount: number;
        dueDay: number;
        email: string;
        fullName: string;
        memberId: string;
        phone: string | null;
      }
    >
  >((accumulator, schedule) => {
    const profile = profileMap.get(schedule.member_id);
    const member = memberMap.get(schedule.member_id);

    if (!profile || !member) {
      return accumulator;
    }

    if (profile.status !== "active" || member.onboarding_status !== "registered") {
      return accumulator;
    }

    const aggregateKey = `${schedule.member_id}:${schedule.due_day}`;
    const existingReminder = accumulator.get(aggregateKey);

    if (existingReminder) {
      existingReminder.amount += parseMoney(schedule.monthly_amount);
      return accumulator;
    }

    accumulator.set(aggregateKey, {
      amount: parseMoney(schedule.monthly_amount),
      dueDay: schedule.due_day,
      email: profile.email,
      fullName: profile.full_name,
      memberId: schedule.member_id,
      phone: profile.phone,
    });

    return accumulator;
  }, new Map());
  const aggregatedSchedules = Array.from(aggregatedScheduleMap.values());

  const supabaseFunctionAuthToken = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  let smsSent = 0;
  let emailsSent = 0;
  const warnings: string[] = [];

  for (const reminder of aggregatedSchedules) {
    const dueDayLabel = formatOrdinal(reminder.dueDay);
    const memberId = reminder.memberId;

    if (!memberId || !supabaseFunctionAuthToken) {
      warnings.push(
        `${reminder.fullName}: The reminder could not be dispatched because the notification function credentials are unavailable.`,
      );
      continue;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseFunctionAuthToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actionUrl: "/portal",
        emailSubject:
          "Monthly contribution reminder - Ifemelunma Cooperative Society",
        memberId,
        message: `Dear ${reminder.fullName}, your monthly contribution of ${formatNaira(
          reminder.amount,
        )} is due on the ${dueDayLabel}. Log in to the member portal to complete your payment on time.`,
        title: "Monthly contribution due",
        type: "due_reminder",
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | SendNotificationResult
      | null;

    if (!response.ok) {
      warnings.push(
        `${reminder.fullName}: ${
          payload?.error ??
          "The due reminder could not be delivered through the notification function."
        }`,
      );
      continue;
    }

    if (payload?.smsSent) {
      smsSent += 1;
    }

    if (payload?.emailSent) {
      emailsSent += 1;
    }

    for (const warning of payload?.warnings ?? []) {
      if (warning) {
        warnings.push(`${reminder.fullName}: ${warning}`);
      }
    }
  }

  return json({
    emailsSent,
    membersConsidered: aggregatedSchedules.length,
    smsSent,
    warnings,
  });
});
