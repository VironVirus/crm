"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { finishSupabaseAuthFromUrl } from "@/lib/auth/email-auth";
import { loadPendingRegistrationDraft } from "@/lib/auth/pending-registration";
import { activateProtectedSession } from "@/lib/session-state";

type ConfirmState =
  | {
      message: string;
      status: "error";
    }
  | {
      message: string;
      status: "processing";
    };

export default function AuthConfirmPage() {
  const router = useRouter();
  const [state, setState] = useState<ConfirmState>({
    message: "Finishing your secure sign-in...",
    status: "processing",
  });

  useEffect(() => {
    let active = true;

    async function finalizeAuth() {
      const result = await finishSupabaseAuthFromUrl(window.location.href);

      if (!active) {
        return;
      }

      if (result.status === "error") {
        setState({
          message: result.message,
          status: "error",
        });
        return;
      }

      activateProtectedSession();

      const pendingRegistrationDraft = loadPendingRegistrationDraft();

      if (result.intent === "register") {
        if (pendingRegistrationDraft) {
          router.replace("/register/");
          return;
        }

        setState({
          message:
            "Your email was confirmed, but the saved registration details have expired. Please re-enter them to finish creating your account.",
          status: "error",
        });
        return;
      }

      if (!result.intent && pendingRegistrationDraft) {
        router.replace("/register/");
        return;
      }

      router.replace(result.nextPath);
    }

    void finalizeAuth();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.12),_transparent_30%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)))] px-4 py-8 text-foreground sm:px-6 sm:py-10">
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <Card className="bg-card/90 shadow-[0_30px_80px_rgba(2,6,23,0.12)] backdrop-blur dark:shadow-[0_30px_80px_rgba(2,6,23,0.55)]">
          <CardHeader className="items-center space-y-4 text-center">
            <BrandMark priority size="lg" variant="full" />
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-700 dark:text-emerald-200">
              {state.status === "processing" ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <AlertCircle className="h-6 w-6" />
              )}
            </div>
            <CardTitle className="font-['Outfit'] text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
              {state.status === "processing"
                ? "Confirming your email"
                : "We could not finish sign-in"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-center">
            <p className="text-sm text-muted-foreground">{state.message}</p>

            {state.status === "processing" ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <ShieldCheck className="h-4 w-4" />
                Please wait
              </div>
            ) : (
              <div className="grid gap-3">
                <Button asChild size="lg">
                  <Link href="/login/">Return to login</Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/register/">Open registration</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
