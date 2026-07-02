import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { finalizeMeetingAttendance } from "@/lib/meetings/server";
import { adminMeetingActionSchema } from "@/lib/validation/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { meetingId: string } },
) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the meeting action.", 400);
  }

  const parsed = adminMeetingActionSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the meeting action and try again.",
      400,
    );
  }

  const supabase = createServerSupabaseClient();
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

  try {
    if (parsed.data.action === "cancel") {
      const { error } = await admin
        .from("meetings")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.meetingId);

      if (error) {
        return jsonError(error.message ?? "Unable to cancel the meeting.", 500);
      }
    } else {
      await finalizeMeetingAttendance({
        admin,
        closedBy: user.id,
        meetingId: params.meetingId,
      });
    }
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
    message:
      parsed.data.action === "cancel"
        ? "Meeting cancelled successfully."
        : "Meeting attendance closed successfully.",
  });
}
