import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { setMeetingAttendanceApproval } from "@/lib/meetings/server";
import { adminMeetingAttendanceApprovalSchema } from "@/lib/validation/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: {
      attendanceId: string;
      meetingId: string;
    };
  },
) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the attendance approval update.", 400);
  }

  const parsed = adminMeetingAttendanceApprovalSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the attendance approval and try again.",
      400,
    );
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before approving attendance.", 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: actingProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (actingProfile?.role !== "admin") {
    return jsonError("Only administrators can approve attendance.", 403);
  }

  try {
    await setMeetingAttendanceApproval({
      admin,
      attendanceId: params.attendanceId,
      approvedBy: user.id,
      isApproved: parsed.data.isApproved,
      meetingId: params.meetingId,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Unable to update attendance approval right now.",
      500,
    );
  }

  revalidatePath("/admin/governance");
  revalidatePath("/portal/governance");
  revalidatePath("/portal");

  return NextResponse.json({
    message: parsed.data.isApproved
      ? "Attendance approved successfully."
      : "Attendance approval removed successfully.",
  });
}
