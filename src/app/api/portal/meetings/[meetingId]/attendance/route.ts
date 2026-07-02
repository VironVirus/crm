import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { markMemberAttendance } from "@/lib/meetings/server";
import { sendMemberNotification } from "@/lib/notification-dispatch";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(
  _request: Request,
  { params }: { params: { meetingId: string } },
) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before marking attendance.", 401);
  }

  const admin = createSupabaseAdminClient();

  try {
    const status = await markMemberAttendance({
      admin,
      meetingId: params.meetingId,
      memberId: user.id,
    });

    if (status === "late") {
      await sendMemberNotification(admin, {
        actionUrl: "/portal/governance",
        contextLabel: "Attendance charge notice",
        emailSubject:
          "Meeting attendance charge - Ifemelunma Multi-Purpose Co-operative Society",
        memberId: user.id,
        message:
          "Your attendance was marked late for the meeting, so a ₦1,000 charge has been added to your profile.",
        title: "Late attendance charge added",
        type: "attendance_charge",
      });
    }

    revalidatePath("/portal/governance");
    revalidatePath("/portal");

    return NextResponse.json({
      message:
        status === "late"
          ? "Attendance marked successfully. A late charge has been added."
          : "Attendance marked successfully.",
      status,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Attendance could not be recorded right now.",
      500,
    );
  }
}
