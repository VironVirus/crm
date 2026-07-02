import { redirect } from "next/navigation";
import { ProtectedSessionGuard } from "@/components/auth/protected-session-guard";
import MemberShell from "@/components/shells/member-shell";
import { getMemberTier } from "@/lib/member-tier";
import { ensureMemberRecord } from "@/lib/members";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { KYC_STORAGE_BUCKET } from "@/lib/validation/member-registration";

type ProfileRecord = {
  full_name: string;
  is_verified: boolean;
  member_number: string | null;
};

type MemberRecord = {
  national_id_path: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerSupabaseClient();
  const admin = createSupabaseAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profileResult = await supabase
    .from("profiles")
    .select("full_name, member_number, is_verified")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileResult.data as ProfileRecord | null;
  const ensuredMemberResult = await ensureMemberRecord(admin, {
    memberId: user.id,
    memberNumber: profile?.member_number ?? null,
    select:
      "next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
  });
  const member = ensuredMemberResult.data as MemberRecord | null;
  const userAvatarUrl = member?.passport_photo_path
    ? (
        await admin.storage
          .from(KYC_STORAGE_BUCKET)
          .createSignedUrl(member.passport_photo_path, 60 * 60)
      ).data?.signedUrl ?? null
    : null;

  return (
    <MemberShell
      memberName={profile?.full_name ?? user.email ?? "Member"}
      memberNumber={profile?.member_number ?? null}
      memberTier={getMemberTier(member)}
      memberVerified={profile?.is_verified ?? false}
      userAvatarUrl={userAvatarUrl}
      userEmail={user.email}
    >
      <ProtectedSessionGuard>{children}</ProtectedSessionGuard>
    </MemberShell>
  );
}
