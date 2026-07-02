import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { dispatchMeetingReminders } from "@/lib/meetings/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before sending meeting reminders.", 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: actingProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (actingProfile?.role !== "admin") {
    return jsonError("Only administrators can send meeting reminders.", 403);
  }

  await dispatchMeetingReminders(admin);
  revalidatePath("/admin/governance");
  revalidatePath("/portal/governance");
  revalidatePath("/portal");

  return NextResponse.json({
    message: "Meeting reminders were sent for every due meeting.",
  });
}
