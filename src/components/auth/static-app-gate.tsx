"use client";

import { type ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AdminShell from "@/components/shells/admin-shell";
import MemberShell from "@/components/shells/member-shell";
import { ProtectedSessionGuard } from "@/components/auth/protected-session-guard";
import { getMemberTier, type MemberTierSource } from "@/lib/member-tier";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { KYC_STORAGE_BUCKET } from "@/lib/validation/member-registration";

type GateState =
  | { status: "loading" }
  | { message: string; status: "error" }
  | {
      member: (MemberTierSource & { passport_photo_path?: string | null }) | null;
      profile: {
        full_name: string;
        is_verified: boolean;
        member_number: string | null;
        role: string;
      } | null;
      status: "ready";
      userEmail?: string;
    };

type StaticMemberRecord = MemberTierSource & {
  passport_photo_path?: string | null;
};

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="rounded-3xl border border-border bg-card px-6 py-5 text-sm text-muted-foreground shadow-xl">
        Loading your cooperative account…
      </div>
    </main>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="max-w-md rounded-3xl border border-rose-400/25 bg-card p-6 shadow-xl">
        <h1 className="font-['Outfit'] text-xl font-semibold">Unable to open your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <a className="mt-5 inline-flex text-sm font-medium text-emerald-700 underline dark:text-emerald-200" href="/login/">
          Return to sign in
        </a>
      </div>
    </main>
  );
}

function useStaticAccountGate(expectedRole: "admin" | "member") {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<GateState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const supabase = createBrowserSupabaseClient();

    async function loadAccount() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (userError || !user) {
        const nextPath = `${pathname}${window.location.search}`;
        router.replace(`/login/?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, is_verified, member_number, role")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;

      if (profileError || !profile) {
        setState({
          message: profileError?.message ?? "Your member profile could not be found.",
          status: "error",
        });
        return;
      }

      if (expectedRole === "admin" && profile.role !== "admin") {
        router.replace("/portal/");
        return;
      }

      if (expectedRole === "member" && profile.role === "admin") {
        router.replace("/admin/");
        return;
      }

      let member: StaticMemberRecord | null = null;

      if (expectedRole === "member") {
        const { data, error } = await supabase
          .from("members")
          .select(
            "next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
          )
          .eq("id", user.id)
          .maybeSingle();

        if (!active) return;

        if (error) {
          setState({ message: error.message, status: "error" });
          return;
        }

        member = data;
      }

      setState({
        member,
        profile,
        status: "ready",
        userEmail: user.email,
      });
    }

    void loadAccount();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login/");
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [expectedRole, pathname, router]);

  return state;
}

export function StaticAdminGate({ children }: { children: ReactNode }) {
  const state = useStaticAccountGate("admin");

  if (state.status === "loading") return <LoadingScreen />;
  if (state.status === "error") return <ErrorScreen message={state.message} />;

  return (
    <AdminShell userEmail={state.userEmail}>
      <ProtectedSessionGuard>{children}</ProtectedSessionGuard>
    </AdminShell>
  );
}

export function StaticMemberGate({ children }: { children: ReactNode }) {
  const state = useStaticAccountGate("member");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAvatar() {
      if (state.status !== "ready" || !state.member?.passport_photo_path) {
        setAvatarUrl(null);
        return;
      }

      const { data } = await createBrowserSupabaseClient()
        .storage
        .from(KYC_STORAGE_BUCKET)
        .createSignedUrl(state.member.passport_photo_path, 60 * 60);

      if (active) setAvatarUrl(data?.signedUrl ?? null);
    }

    void loadAvatar();
    return () => {
      active = false;
    };
  }, [state]);

  if (state.status === "loading") return <LoadingScreen />;
  if (state.status === "error") return <ErrorScreen message={state.message} />;

  return (
    <MemberShell
      memberName={state.profile?.full_name ?? state.userEmail ?? "Member"}
      memberNumber={state.profile?.member_number ?? null}
      memberTier={getMemberTier(state.member)}
      memberVerified={state.profile?.is_verified ?? false}
      userAvatarUrl={avatarUrl}
      userEmail={state.userEmail}
    >
      <ProtectedSessionGuard>{children}</ProtectedSessionGuard>
    </MemberShell>
  );
}
