import { redirect } from "next/navigation";
import MemberShell from "@/components/shells/member-shell";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

  return (
    <MemberShell userEmail={user.email} userId={user.id}>
      {children}
    </MemberShell>
  );
}
