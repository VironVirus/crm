import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  finalizeMeetingAttendance,
  loadMeetingById,
  recalculateMeetingAttendanceStatuses,
} from "@/lib/meetings/server";
import {
  adminMeetingActionSchema,
  adminMeetingSchema,
} from "@/lib/validation/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const { meetingId } = await params;
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the meeting update.", 400);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before updating a meeting.", 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: actingProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (actingProfile?.role !== "admin") {
    return jsonError("Only administrators can update meetings.", 403);
  }

  const existingMeeting = await loadMeetingById(admin, meetingId);

  if (!existingMeeting) {
    return jsonError("The selected meeting could not be found.", 404);
  }

  try {
    if (
      payload &&
      typeof payload === "object" &&
      "action" in payload &&
      typeof payload.action === "string"
    ) {
      const parsedAction = adminMeetingActionSchema.safeParse(payload);

      if (!parsedAction.success) {
        return jsonError(
          parsedAction.error.issues[0]?.message ??
            "Please review the meeting action and try again.",
          400,
        );
      }

      if (parsedAction.data.action === "cancel") {
        const { error } = await admin
          .from("meetings")
          .update({
            status: "cancelled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", meetingId);

        if (error) {
          return jsonError(
            error.message ?? "Unable to cancel the meeting.",
            500,
          );
        }

        revalidatePath("/admin/governance");
        revalidatePath("/portal/governance");
        revalidatePath("/portal");

        return NextResponse.json({
          message: "Meeting cancelled successfully.",
        });
      }

      await finalizeMeetingAttendance({
        admin,
        closedBy: user.id,
        meetingId,
      });

      revalidatePath("/admin/governance");
      revalidatePath("/portal/governance");
      revalidatePath("/portal");

      return NextResponse.json({
        message: "Meeting ended and attendance closed successfully.",
      });
    }

    const parsedMeeting = adminMeetingSchema.safeParse(payload);

    if (!parsedMeeting.success) {
      return jsonError(
        parsedMeeting.error.issues[0]?.message ??
          "Please review the meeting details and try again.",
        400,
      );
    }

    if (existingMeeting.status !== "scheduled") {
      return jsonError(
        "Only scheduled meetings can still be edited.",
        409,
      );
    }

    const { error } = await admin
      .from("meetings")
      .update({
        agenda: parsedMeeting.data.agenda || null,
        absence_fee: parsedMeeting.data.absenceFee,
        attendance_closes_at: parsedMeeting.data.attendanceClosesAt,
        daily_reminder_sent_at: null,
        final_reminder_sent_at: null,
        lateness_starts_at: parsedMeeting.data.latenessStartsAt,
        late_fee: parsedMeeting.data.lateFee,
        location: parsedMeeting.data.location || null,
        reminder_message: parsedMeeting.data.reminderMessage || null,
        starts_at: parsedMeeting.data.startsAt,
        title: parsedMeeting.data.title,
        updated_at: new Date().toISOString(),
      })
      .eq("id", meetingId);

    if (error) {
      return jsonError(
        error.message ?? "Unable to update the meeting.",
        500,
      );
    }

    await recalculateMeetingAttendanceStatuses({
      admin,
      meetingId,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Unable to update the meeting right now.",
      500,
    );
  }

  revalidatePath("/admin/governance");
  revalidatePath("/portal/governance");
  revalidatePath("/portal");

  return NextResponse.json({
    message: "Meeting updated successfully.",
  });
}
