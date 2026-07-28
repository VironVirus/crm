"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, LogIn, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeAuthErrorMessage } from "@/lib/auth/email-auth";
import { COOPERATIVE_NAME } from "@/lib/brand";
import { buildEmailAuthRedirectUrl } from "@/lib/auth/email-auth";
import { activateProtectedSession } from "@/lib/session-state";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  loginOtpRequestSchema,
  loginOtpVerificationSchema,
} from "@/lib/validation/auth";

type LoginStep = "email" | "otp";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<LoginStep>("email");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isResendingCode, setIsResendingCode] = useState(false);

  async function sendLoginCode() {
    setErrorMessage(null);
    setStatusMessage(null);

    const parsed = loginOtpRequestSchema.safeParse({ email });

    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ??
          "Please review your email address and try again.",
      );
      return;
    }

    setIsSendingCode(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: parsed.data.email,
        options: {
          emailRedirectTo: buildEmailAuthRedirectUrl("login", nextPath),
          shouldCreateUser: false,
        },
      });

      if (error) {
        const normalizedMessage = error.message.toLowerCase();

        setErrorMessage(
          normalizedMessage.includes("signups not allowed")
            ? "We could not find a member account for this email address yet. Please register first."
            : normalizeAuthErrorMessage(
                error.message,
                "We could not send your sign-in code right now. Please try again.",
              ),
        );
        return;
      }

      setEmail(parsed.data.email);
      setOtpCode("");
      setStep("otp");
      setStatusMessage(
        `A 6-digit sign-in code has been sent to ${parsed.data.email}. If your email app shows a sign-in button instead, you can tap it and we will finish the login automatically.`,
      );
    } catch {
      setErrorMessage(
        "We could not send your sign-in code right now. Please check your connection and try again.",
      );
    } finally {
      setIsSendingCode(false);
    }
  }

  async function verifyLoginCode() {
    setErrorMessage(null);
    setStatusMessage(null);

    const parsed = loginOtpVerificationSchema.safeParse({
      email,
      token: otpCode,
    });

    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ??
          "Please enter the verification code from your email.",
      );
      return;
    }

    setIsVerifyingCode(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({
        email: parsed.data.email,
        token: parsed.data.token,
        type: "email",
      });

      if (error) {
        setErrorMessage(
          normalizeAuthErrorMessage(
            error.message,
            "We could not verify your sign-in code right now. Please try again.",
          ),
        );
        return;
      }

      activateProtectedSession();
      router.replace(nextPath);
      router.refresh();
    } catch {
      setErrorMessage(
        "We could not verify your sign-in code right now. Please try again.",
      );
    } finally {
      setIsVerifyingCode(false);
    }
  }

  async function resendLoginCode() {
    setErrorMessage(null);
    setStatusMessage(null);

    const parsed = loginOtpRequestSchema.safeParse({ email });

    if (!parsed.success) {
      setErrorMessage("Use a valid email address to request another code.");
      setStep("email");
      return;
    }

    setIsResendingCode(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: parsed.data.email,
        options: {
          emailRedirectTo: buildEmailAuthRedirectUrl("login", nextPath),
          shouldCreateUser: false,
        },
      });

      if (error) {
        setErrorMessage(
          normalizeAuthErrorMessage(
            error.message,
            "We could not resend your sign-in code right now. Please try again.",
          ),
        );
        return;
      }

      setStatusMessage(
        `A fresh 6-digit code has been sent to ${parsed.data.email}. You can also use the email button if one appears.`,
      );
    } catch {
      setErrorMessage(
        "We could not resend your sign-in code right now. Please try again.",
      );
    } finally {
      setIsResendingCode(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step === "email") {
      void sendLoginCode();
      return;
    }

    void verifyLoginCode();
  }

  return (
    <Card className="bg-card/90 shadow-[0_30px_80px_rgba(2,6,23,0.12)] backdrop-blur dark:shadow-[0_30px_80px_rgba(2,6,23,0.55)]">
      <CardHeader className="items-center space-y-4 text-center">
        <BrandMark priority size="lg" variant="full" />
        <CardTitle className="font-['Outfit'] text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          Welcome to {COOPERATIVE_NAME}, please login.
        </CardTitle>
        <div className="inline-flex w-fit rounded-full border border-border bg-secondary p-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          <button
            className="rounded-full bg-emerald-500/15 px-4 py-2 text-emerald-700 transition dark:text-emerald-200"
            type="button"
          >
            <span className="inline-flex items-center gap-2">
              <LogIn size={14} />
              Sign in
            </span>
          </button>
          <Button asChild className="rounded-full px-4 py-2" variant="secondary">
            <Link href="/register">
              <span className="inline-flex items-center gap-2">
                <UserPlus size={14} />
                Register
              </span>
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit}>
          {step === "email" ? (
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="Email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-3xl border border-border bg-secondary p-4 text-left">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-200">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Check your email</p>
                    <p className="text-sm text-muted-foreground">
                      Enter the 6-digit code sent to {email}. If your mailbox opens a sign-in button instead, tap it and we will bring you straight back in.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="otpCode">Verification code</Label>
                <Input
                  id="otpCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value)}
                  required
                />
              </div>
            </div>
          )}

          {statusMessage ? (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-100">
              {statusMessage}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          {step === "email" ? (
            <Button className="w-full" disabled={isSendingCode} type="submit">
              {isSendingCode ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending code...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Send login code
                </>
              )}
            </Button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Button className="w-full" disabled={isVerifyingCode} type="submit">
                {isVerifyingCode ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <LogIn className="mr-2 h-4 w-4" />
                    Verify and sign in
                  </>
                )}
              </Button>
              <Button
                className="w-full"
                disabled={isResendingCode}
                onClick={() => void resendLoginCode()}
                type="button"
                variant="secondary"
              >
                {isResendingCode ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resending...
                  </>
                ) : (
                  "Resend code"
                )}
              </Button>
              <Button
                className="sm:col-span-2"
                onClick={() => {
                  setErrorMessage(null);
                  setStatusMessage(null);
                  setOtpCode("");
                  setStep("email");
                }}
                type="button"
                variant="outline"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Use another email
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
