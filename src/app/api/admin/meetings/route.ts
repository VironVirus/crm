import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { sendBatchMemberNotifications } from "@/lib/notification-dispatch";
import { adminMeetingSchema } from "@/lib/validation/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the meeting details.", 400);
  }

  const parsed = adminMeetingSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the meeting details and try again.",
      400,
    );
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before scheduling a meeting.", 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: actingProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (actingProfile?.role !== "admin") {
    return jsonError("Only administrators can schedule meetings.", 403);
  }

  const { data: meeting, error: meetingError } = await admin
    .from("meetings")
    .insert({
      agenda: parsed.data.agenda || null,
      attendance_closes_at: parsed.data.attendanceClosesAt,
      created_by: user.id,
      location: parsed.data.location || null,
      reminder_message: parsed.data.reminderMessage || null,
      starts_at: parsed.data.startsAt,
      title: parsed.data.title,
    })
    .select("id, title, starts_at, location")
    .single();

  if (meetingError || !meeting) {
    return jsonError(
      meetingError?.message ?? "Unable to schedule the meeting right now.",
      500,
    );
  }

  const { data: members } = await admin
    .from("profiles")
    .select("id")
    .eq("status", "active")
    .not("member_number", "is", null);

  const memberIds = ((members as Array<{ id: string }> | null) ?? []).map(
    (member) => member.id,
  );

  if (memberIds.length > 0) {
    await sendBatchMemberNotifications(
      admin,
      memberIds.map((memberId) => ({
        actionUrl: "/portal/governance",
        contextLabel: `Meeting notice for ${memberId}`,
        emailSubject:
          "New meeting scheduled - Ifemelunma Multi-Purpose Co-operative Society",
        memberId,
        message: `${meeting.title} has been scheduled for ${new Intl.DateTimeFormat(
          "en-NG",
          {
            dateStyle: "medium",
            timeStyle: "short",
          },
        ).format(new Date(meeting.starts_at))}.${meeting.location ? ` Location: ${meeting.location}.` : ""} Please attend on time and mark your attendance from the member portal.`,
        title: "New cooperative meeting",
        type: "meeting_update",
      })),
    );
  }

  revalidatePath("/admin/governance");
  revalidatePath("/portal/governance");
  revalidatePath("/portal");

  return NextResponse.json({
    message: "Meeting scheduled successfully.",
  });
}
