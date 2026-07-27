import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { sendMemberNotification } from "@/lib/notification-dispatch";
import { adminMemberUpdateSchema } from "@/lib/validation/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const { memberId } = await params;
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the member update.", 400);
  }

  const parsed = adminMemberUpdateSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the member update and try again.",
      400,
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before updating a member.", 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: actingProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (actingProfile?.role !== "admin") {
    return jsonError("Only administrators can update member roles.", 403);
  }

  const { data: memberRecord, error: memberError } = await admin
    .from("members")
    .select("national_id_path, passport_photo_path, utility_bill_path")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError || !memberRecord) {
    return jsonError("The member record could not be found.", 404);
  }

  if (
    parsed.data.isVerified &&
    (!memberRecord.national_id_path ||
      !memberRecord.passport_photo_path ||
      !memberRecord.utility_bill_path)
  ) {
    return jsonError(
      "A member can only be verified after all KYC documents have been uploaded.",
      400,
    );
  }

  const profileUpdate = {
    is_verified: parsed.data.isVerified,
    role: parsed.data.role,
    status: parsed.data.status,
    verification_note: parsed.data.verificationNote || null,
    verified_at: parsed.data.isVerified ? new Date().toISOString() : null,
    verified_by: parsed.data.isVerified ? user.id : null,
  };

  const { data: updatedProfile, error: updateError } = await admin
    .from("profiles")
    .update(profileUpdate)
    .eq("id", memberId)
    .select("full_name, is_verified")
    .single();

  if (updateError || !updatedProfile) {
    return jsonError(
      updateError?.message ?? "Unable to update the member profile.",
      500,
    );
  }

  if (parsed.data.isVerified) {
    await sendMemberNotification(admin, {
      actionUrl: "/portal/profile",
      contextLabel: "Member verification notice",
      emailSubject:
        "KYC verified - Ifemelunma Multi-Purpose Co-operative Society",
      memberId,
      message:
        "Your KYC documents have been reviewed and your member profile is now verified.",
      title: "Member profile verified",
      type: "member_verified",
    });
  }

  revalidatePath("/admin/members");
  revalidatePath("/portal");
  revalidatePath("/portal/profile");

  return NextResponse.json({
    message: `${updatedProfile.full_name} updated successfully.`,
  });
}
