import { redirect } from "next/navigation";
import MemberShell from "@/components/shells/member-shell";
import { getMemberTier } from "@/lib/member-tier";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ProfileRecord = {
  full_name: string;
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [profileResult, memberResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, member_number")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("members")
      .select(
        "next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
      )
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  const profile = profileResult.data as ProfileRecord | null;
  const member = memberResult.data as MemberRecord | null;

  return (
    <MemberShell
      memberName={profile?.full_name ?? user.email ?? "Member"}
      memberNumber={profile?.member_number ?? null}
      memberTier={getMemberTier(member)}
      userEmail={user.email}
      userId={user.id}
    >
      {children}
    </MemberShell>
  );
}
