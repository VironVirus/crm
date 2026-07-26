import { redirect } from "next/navigation";
import MemberProfilePageView from "@/features/portal/profile/page-view";
import { getMemberTier } from "@/lib/member-tier";
import {
  ensureMemberRecord,
  MEMBER_PLACEHOLDER_ADDRESS,
  MEMBER_PLACEHOLDER_OCCUPATION,
  normalizeMemberDate,
  normalizeMemberText,
} from "@/lib/members";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { KYC_STORAGE_BUCKET } from "@/lib/validation/member-registration";

type ProfileRecord = {
  email: string;
  full_name: string;
  is_verified: boolean;
  member_number: string | null;
  phone: string | null;
};

type MemberRecord = {
  address: string;
  date_of_birth: string;
  national_id_path: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  occupation: string;
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

export default async function PortalProfilePage() {
  const supabase = await createServerSupabaseClient();
  const admin = createSupabaseAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/portal/profile");
  }

  const profileResult = await supabase
    .from("profiles")
    .select("email, full_name, member_number, phone, is_verified")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileResult.data as ProfileRecord | null;
  const memberResult = await ensureMemberRecord(admin, {
    memberId: user.id,
    memberNumber: profile?.member_number ?? null,
    select:
      "address, date_of_birth, occupation, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
  });
  const member = memberResult.data as MemberRecord | null;
  const passportPhotoUrl = member?.passport_photo_path
    ? (
        await admin.storage
          .from(KYC_STORAGE_BUCKET)
          .createSignedUrl(member.passport_photo_path, 60 * 60)
      ).data?.signedUrl ?? null
    : null;
  const tier = getMemberTier(member);
  const errors = [profileResult.error?.message, memberResult.error?.message].filter(
    Boolean,
  );

  return (
    <MemberProfilePageView
      address={normalizeMemberText(member?.address, MEMBER_PLACEHOLDER_ADDRESS)}
      dataError={errors.length > 0 ? errors.join(" ") : null}
      dateOfBirth={normalizeMemberDate(member?.date_of_birth)}
      email={profile?.email ?? user.email ?? ""}
      kycStatus={{
        nationalId: Boolean(member?.national_id_path),
        passportPhoto: Boolean(member?.passport_photo_path),
        utilityBill: Boolean(member?.utility_bill_path),
      }}
      isVerified={profile?.is_verified ?? false}
      memberName={profile?.full_name ?? user.email ?? "Member"}
      memberNumber={profile?.member_number ?? null}
      nextOfKin={{
        nextOfKinName: member?.next_of_kin_name ?? "",
        nextOfKinPhone: member?.next_of_kin_phone ?? "",
        nextOfKinRelationship: member?.next_of_kin_relationship ?? "",
      }}
      occupation={normalizeMemberText(
        member?.occupation,
        MEMBER_PLACEHOLDER_OCCUPATION,
      )}
      passportPhotoUrl={passportPhotoUrl}
      phone={profile?.phone ?? null}
      tier={tier}
    />
  );
}
