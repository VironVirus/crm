"use client";

import { staticApiFetch } from "@/lib/static-api";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowLeft, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  buildEmailAuthRedirectUrl,
  normalizeAuthErrorMessage,
} from "@/lib/auth/email-auth";
import {
  clearPendingRegistrationDraft,
  loadPendingRegistrationDraft,
  savePendingRegistrationDraft,
} from "@/lib/auth/pending-registration";
import { COOPERATIVE_NAME } from "@/lib/brand";
import { activateProtectedSession } from "@/lib/session-state";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { loginOtpVerificationSchema } from "@/lib/validation/auth";
import {
  memberRegistrationSchema,
  type MemberRegistrationValues,
} from "@/lib/validation/member-registration";

type RegistrationSuccess = {
  email: string;
  fullName: string;
  memberNumber: string;
};

type RegistrationFormResponse = {
  email?: string;
  fieldErrors?: Record<string, string[]>;
  fullName?: string;
  memberNumber?: string;
  message?: string;
  status?: "ready" | "resume";
};

type VerificationStatus = "idle" | "pending" | "confirmed";

const defaultValues: MemberRegistrationValues = {
  address: "",
  dateOfBirth: "",
  email: "",
  fullName: "",
  occupation: "",
  phone: "",
};

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-700 dark:text-rose-200">{message}</p>;
}

function buildRegistrationFormData(values: MemberRegistrationValues) {
  const body = new FormData();
  body.set("fullName", values.fullName);
  body.set("email", values.email);
  body.set("phone", values.phone);
  body.set("dateOfBirth", values.dateOfBirth);
  body.set("address", values.address);
  body.set("occupation", values.occupation);
  return body;
}

export function MemberRegistrationForm() {
  const [success, setSuccess] = useState<RegistrationSuccess | null>(null);
  const [registrationDraft, setRegistrationDraft] =
    useState<MemberRegistrationValues | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationStatus, setVerificationStatus] =
    useState<VerificationStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isResendingCode, setIsResendingCode] = useState(false);
  const [isFinalizingRegistration, setIsFinalizingRegistration] = useState(false);
  const hasRestoredDraft = useRef(false);

  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<MemberRegistrationValues>({
    resolver: zodResolver(memberRegistrationSchema),
    defaultValues,
    mode: "onTouched",
  });

  function applyFieldErrors(fieldErrors?: Record<string, string[]>) {
    if (!fieldErrors) {
      return;
    }

    Object.entries(fieldErrors).forEach(([fieldName, messages]) => {
      const firstMessage = messages?.[0];

      if (firstMessage) {
        setError(fieldName as keyof MemberRegistrationValues, {
          type: "server",
          message: firstMessage,
        });
      }
    });
  }

  async function finalizeRegistration(values: MemberRegistrationValues) {
    setSubmitError(null);
    setStatusMessage("Finishing your cooperative registration...");
    setIsFinalizingRegistration(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setVerificationStatus("pending");
        setStatusMessage(null);
        setSubmitError(
          "Your verification session expired before we could finish registration. Please request a new code.",
        );
        return;
      }

      const response = await staticApiFetch("/api/member-registration/complete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      const payload = (await response.json().catch(() => null)) as
        | RegistrationFormResponse
        | null;

      if (!response.ok) {
        setStatusMessage(null);
        applyFieldErrors(payload?.fieldErrors);
        setSubmitError(
          payload?.message ??
            "We could not complete your registration right now. Please try again.",
        );
        return;
      }

      activateProtectedSession();
      clearPendingRegistrationDraft();
      setSuccess({
        email: payload?.email ?? values.email,
        fullName: payload?.fullName ?? values.fullName,
        memberNumber: payload?.memberNumber ?? "",
      });
      setRegistrationDraft(null);
      setVerificationCode("");
      setVerificationStatus("idle");
      setStatusMessage(null);
      reset(defaultValues);
    } catch {
      setStatusMessage(null);
      setSubmitError(
        "The registration request could not be completed. Check your connection and try again.",
      );
    } finally {
      setIsFinalizingRegistration(false);
    }
  }

  useEffect(() => {
    if (hasRestoredDraft.current) {
      return;
    }

    hasRestoredDraft.current = true;

    const draft = loadPendingRegistrationDraft();

    if (!draft) {
      return;
    }

    const restoredDraft = draft;

    reset(restoredDraft);
    setRegistrationDraft(restoredDraft);
    setVerificationStatus("pending");
    setStatusMessage(
      `We restored your pending registration for ${restoredDraft.email}. Enter the 6-digit code from your email, or use the sign-in button if your mailbox shows one.`,
    );

    async function resumeRegistration() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        return;
      }

      await finalizeRegistration(restoredDraft);
    }

    void resumeRegistration();
  }, [reset]);

  const submitRegistration = handleSubmit(async (values) => {
    setSubmitError(null);
    setStatusMessage("Sending your email verification code...");
    setIsSendingCode(true);

    try {
      const response = await staticApiFetch("/api/member-registration", {
        method: "POST",
        body: buildRegistrationFormData(values),
      });

      const payload = (await response.json().catch(() => null)) as
        | RegistrationFormResponse
        | null;

      if (!response.ok) {
        applyFieldErrors(payload?.fieldErrors);
        setStatusMessage(null);
        setSubmitError(
          payload?.message ??
            "We could not prepare your registration right now. Please try again.",
        );
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: values.email,
        options: {
          emailRedirectTo: buildEmailAuthRedirectUrl("register"),
          shouldCreateUser: true,
          data: {
            address: values.address,
            date_of_birth: values.dateOfBirth,
            full_name: values.fullName,
            occupation: values.occupation,
            phone: values.phone,
          },
        },
      });

      if (error) {
        setStatusMessage(null);
        setSubmitError(
          normalizeAuthErrorMessage(
            error.message,
            "We could not send your verification code right now. Please try again.",
          ),
        );
        return;
      }

      savePendingRegistrationDraft(values);
      setRegistrationDraft(values);
      setVerificationCode("");
      setVerificationStatus("pending");
      setStatusMessage(
        payload?.status === "resume"
          ? `We found your pending registration and sent a fresh 6-digit code to ${values.email}. If your mailbox shows a sign-in button instead, you can use it and we will continue automatically.`
          : `A 6-digit verification code has been sent to ${values.email}. If your mailbox shows a sign-in button instead, you can use it and we will continue automatically.`,
      );
    } catch {
      setStatusMessage(null);
      setSubmitError(
        "The registration request could not be completed. Check your connection and try again.",
      );
    } finally {
      setIsSendingCode(false);
    }
  });

  async function verifyRegistrationCode() {
    if (!registrationDraft) {
      setVerificationStatus("idle");
      setSubmitError("Please enter your details again so we can continue.");
      return;
    }

    setSubmitError(null);
    setStatusMessage(null);

    const parsed = loginOtpVerificationSchema.safeParse({
      email: registrationDraft.email,
      token: verificationCode,
    });

    if (!parsed.success) {
      setSubmitError(
        parsed.error.issues[0]?.message ??
          "Enter the 6-digit code that was sent to your email.",
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
        setSubmitError(
          normalizeAuthErrorMessage(
            error.message,
            "We could not verify your email code right now. Please try again.",
          ),
        );
        return;
      }

      setVerificationStatus("confirmed");
      await finalizeRegistration(registrationDraft);
    } catch {
      setSubmitError(
        "We could not verify your email code right now. Please try again.",
      );
    } finally {
      setIsVerifyingCode(false);
    }
  }

  async function resendVerificationCode() {
    if (!registrationDraft) {
      setVerificationStatus("idle");
      setSubmitError("Please enter your details again so we can continue.");
      return;
    }

    setSubmitError(null);
    setStatusMessage(null);
    setIsResendingCode(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: registrationDraft.email,
        options: {
          emailRedirectTo: buildEmailAuthRedirectUrl("register"),
          shouldCreateUser: true,
          data: {
            address: registrationDraft.address,
            date_of_birth: registrationDraft.dateOfBirth,
            full_name: registrationDraft.fullName,
            occupation: registrationDraft.occupation,
            phone: registrationDraft.phone,
          },
        },
      });

      if (error) {
        setSubmitError(
          normalizeAuthErrorMessage(
            error.message,
            "We could not resend your verification code right now. Please try again.",
          ),
        );
        return;
      }

      savePendingRegistrationDraft(registrationDraft);
      setStatusMessage(
        `A fresh 6-digit verification code has been sent to ${registrationDraft.email}. You can also use the email button if one appears.`,
      );
    } catch {
      setSubmitError(
        "We could not resend your verification code right now. Please try again.",
      );
    } finally {
      setIsResendingCode(false);
    }
  }

  if (success) {
    return (
      <Card className="bg-card/90 shadow-[0_30px_80px_rgba(2,6,23,0.12)] backdrop-blur dark:shadow-[0_30px_80px_rgba(2,6,23,0.55)]">
        <CardHeader className="items-center space-y-4 text-center">
          <BrandMark priority size="lg" variant="full" />
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-700 dark:text-emerald-200">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <CardTitle className="font-['Outfit'] text-3xl font-semibold tracking-tight">
            Registration complete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
              Member number
            </p>
            <p className="mt-3 font-['Outfit'] text-3xl font-semibold text-foreground">
              {success.memberNumber}
            </p>
            <p className="mt-2 text-sm text-emerald-900/80 dark:text-emerald-100/80">
              {success.email}
            </p>
          </div>

          <Button asChild className="w-full" size="lg">
            <Link href="/portal">Open dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (verificationStatus !== "idle" && registrationDraft) {
    const isPendingVerification = verificationStatus === "pending";

    return (
      <Card className="bg-card/90 shadow-[0_30px_80px_rgba(2,6,23,0.12)] backdrop-blur dark:shadow-[0_30px_80px_rgba(2,6,23,0.55)]">
        <CardHeader className="items-center space-y-4 text-center">
          <BrandMark priority size="lg" variant="full" />
          <CardTitle className="font-['Outfit'] text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            Confirm your email to finish registration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-3xl border border-border bg-secondary p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-200">
                {isPendingVerification ? (
                  <Mail className="h-5 w-5" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {isPendingVerification
                    ? "Check your email for the 6-digit code."
                    : "Your email has been confirmed."}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isPendingVerification
                    ? `We sent the verification code to ${registrationDraft.email}. If your mailbox shows a sign-in button instead of the code, tap it and we will resume automatically.`
                    : "Finish registration to generate the member number and open the dashboard."}
                </p>
              </div>
            </div>
          </div>

          {isPendingVerification ? (
            <div className="space-y-2">
              <Label htmlFor="registrationOtpCode">Verification code</Label>
              <Input
                id="registrationOtpCode"
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="6-digit code"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value)}
              />
            </div>
          ) : null}

          {statusMessage ? (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-100">
              {statusMessage}
            </div>
          ) : null}

          {submitError ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
              {submitError}
            </div>
          ) : null}

          {isPendingVerification ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                className="w-full"
                disabled={isVerifyingCode}
                onClick={() => void verifyRegistrationCode()}
                type="button"
              >
                {isVerifyingCode ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Verify and finish
                  </>
                )}
              </Button>
              <Button
                className="w-full"
                disabled={isResendingCode}
                onClick={() => void resendVerificationCode()}
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
                  clearPendingRegistrationDraft();
                  setSubmitError(null);
                  setStatusMessage(null);
                  setVerificationCode("");
                  setVerificationStatus("idle");
                  setRegistrationDraft(null);
                }}
                type="button"
                variant="outline"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Edit your details
              </Button>
            </div>
          ) : (
            <Button
              className="w-full"
              disabled={isFinalizingRegistration}
              onClick={() => void finalizeRegistration(registrationDraft)}
              type="button"
            >
              {isFinalizingRegistration ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finishing registration...
                </>
              ) : (
                "Finish registration"
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/90 shadow-[0_30px_80px_rgba(2,6,23,0.12)] backdrop-blur dark:shadow-[0_30px_80px_rgba(2,6,23,0.55)]">
      <CardHeader className="items-center space-y-4 text-center">
        <BrandMark priority size="lg" variant="full" />
        <CardTitle className="font-['Outfit'] text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          Welcome to {COOPERATIVE_NAME}, please sign up.
        </CardTitle>
      </CardHeader>

      <CardContent>
        <form className="space-y-6" onSubmit={submitRegistration}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                placeholder="Full name"
                {...register("fullName")}
              />
              <FieldMessage message={errors.fullName?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                placeholder="Email address"
                type="email"
                {...register("email")}
              />
              <FieldMessage message={errors.email?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                placeholder="Phone number"
                type="tel"
                {...register("phone")}
              />
              <FieldMessage message={errors.phone?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <Input id="dateOfBirth" type="date" {...register("dateOfBirth")} />
              <FieldMessage message={errors.dateOfBirth?.message} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                placeholder="Address"
                {...register("address")}
              />
              <FieldMessage message={errors.address?.message} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="occupation">Occupation</Label>
              <Input
                id="occupation"
                placeholder="Occupation"
                {...register("occupation")}
              />
              <FieldMessage message={errors.occupation?.message} />
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-secondary p-4 text-sm text-muted-foreground">
            We will send a 6-digit verification code to your email to finish your
            registration securely. If your mail app shows a sign-in button instead,
            the app can finish the same step automatically.
          </div>

          {statusMessage ? (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-100">
              {statusMessage}
            </div>
          ) : null}

          {submitError ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
              {submitError}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Button className="w-full" disabled={isSendingCode} type="submit" size="lg">
              {isSendingCode ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending code...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Continue with email code
                </>
              )}
            </Button>
            <Button asChild className="w-full" size="lg" variant="secondary">
              <Link href="/login">Go to login</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
