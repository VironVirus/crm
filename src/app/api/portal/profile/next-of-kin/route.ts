import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getMemberTier } from "@/lib/member-tier";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { memberNextOfKinSchema } from "@/lib/validation/member-registration";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read your next of kin details.", 400);
  }

  const parsed = memberNextOfKinSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review your next of kin details and try again.",
      400,
    );
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before updating your profile.", 401);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("members")
    .update({
      next_of_kin_name: parsed.data.nextOfKinName,
      next_of_kin_phone: parsed.data.nextOfKinPhone,
      next_of_kin_relationship: parsed.data.nextOfKinRelationship,
    })
    .eq("id", user.id)
    .select(
      "next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
    )
    .single();

  if (error || !data) {
    return jsonError("We could not save your next of kin details right now.", 500);
  }

  revalidatePath("/portal");
  revalidatePath("/portal/governance");
  revalidatePath("/portal/profile");

  return NextResponse.json({
    message: "Your next of kin details have been saved.",
    tier: getMemberTier(data),
  });
}
