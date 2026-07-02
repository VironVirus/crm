import { redirect } from "next/navigation";
import { ProtectedSessionGuard } from "@/components/auth/protected-session-guard";
import AdminShell from "@/components/shells/admin-shell";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminLayout({
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/portal");
  }

  return (
    <AdminShell userEmail={user.email}>
      <ProtectedSessionGuard>{children}</ProtectedSessionGuard>
    </AdminShell>
  );
}
