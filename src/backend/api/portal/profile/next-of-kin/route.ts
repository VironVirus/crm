import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getMemberTier } from "@/lib/member-tier";
import { ensureMemberRecord } from "@/lib/members";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { memberNextOfKinSchema } from "@/lib/validation/member-registration";

export const runtime = "nodejs";

type MemberProfileRecord = {
  address: string;
  date_of_birth: string;
  national_id_path: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  occupation: string;
  onboarding_status: "pending" | "registered";
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

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

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before updating your profile.", 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("member_number")
    .eq("id", user.id)
    .maybeSingle();

  const ensuredMember = await ensureMemberRecord(admin, {
    memberId: user.id,
    memberNumber: profile?.member_number ?? null,
    select:
      "address, date_of_birth, occupation, onboarding_status, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
  });

  if (ensuredMember.error || !ensuredMember.data) {
    return jsonError("Your member profile could not be prepared right now.", 500);
  }

  const currentMember = ensuredMember.data as unknown as MemberProfileRecord;
  const { data, error } = await admin
    .from("members")
    .upsert({
      id: user.id,
      address: currentMember.address,
      date_of_birth: currentMember.date_of_birth,
      occupation: currentMember.occupation,
      onboarding_status: currentMember.onboarding_status,
      next_of_kin_name: parsed.data.nextOfKinName,
      next_of_kin_phone: parsed.data.nextOfKinPhone,
      next_of_kin_relationship: parsed.data.nextOfKinRelationship,
    }, {
      onConflict: "id",
    })
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
