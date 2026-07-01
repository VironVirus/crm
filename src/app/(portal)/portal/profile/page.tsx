import { redirect } from "next/navigation";
import MemberProfilePageView from "@/features/portal/profile/page-view";
import { getMemberTier } from "@/lib/member-tier";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ProfileRecord = {
  email: string;
  full_name: string;
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
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/portal/profile");
  }

  const [profileResult, memberResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("email, full_name, member_number, phone")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("members")
      .select(
        "address, date_of_birth, occupation, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
      )
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const profile = profileResult.data as ProfileRecord | null;
  const member = memberResult.data as MemberRecord | null;
  const tier = getMemberTier(member);
  const errors = [profileResult.error?.message, memberResult.error?.message].filter(
    Boolean,
  );

  return (
    <MemberProfilePageView
      address={member?.address ?? ""}
      dataError={errors.length > 0 ? errors.join(" ") : null}
      dateOfBirth={member?.date_of_birth ?? ""}
      email={profile?.email ?? user.email ?? ""}
      kycStatus={{
        nationalId: Boolean(member?.national_id_path),
        passportPhoto: Boolean(member?.passport_photo_path),
        utilityBill: Boolean(member?.utility_bill_path),
      }}
      memberName={profile?.full_name ?? user.email ?? "Member"}
      memberNumber={profile?.member_number ?? null}
      nextOfKin={{
        nextOfKinName: member?.next_of_kin_name ?? "",
        nextOfKinPhone: member?.next_of_kin_phone ?? "",
        nextOfKinRelationship: member?.next_of_kin_relationship ?? "",
      }}
      occupation={member?.occupation ?? ""}
      phone={profile?.phone ?? null}
      tier={tier}
    />
  );
}
