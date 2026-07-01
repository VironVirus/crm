"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  memberRegistrationSchema,
  type MemberRegistrationValues,
} from "@/lib/validation/member-registration";

type RegistrationSuccess = {
  email: string;
  fullName: string;
  memberNumber: string;
};

const defaultValues: MemberRegistrationValues = {
  address: "",
  confirmPassword: "",
  dateOfBirth: "",
  email: "",
  fullName: "",
  occupation: "",
  password: "",
  phone: "",
};

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-700 dark:text-rose-200">{message}</p>;
}

export function MemberRegistrationForm() {
  const [success, setSuccess] = useState<RegistrationSuccess | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitPhase, setSubmitPhase] = useState<string | null>(null);

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<MemberRegistrationValues>({
    resolver: zodResolver(memberRegistrationSchema),
    defaultValues,
    mode: "onTouched",
  });

  const submitRegistration = handleSubmit(async (values) => {
    setSubmitError(null);
    setSubmitPhase("Creating your member account...");

    const body = new FormData();
    body.set("fullName", values.fullName);
    body.set("email", values.email);
    body.set("phone", values.phone);
    body.set("dateOfBirth", values.dateOfBirth);
    body.set("address", values.address);
    body.set("occupation", values.occupation);
    body.set("password", values.password);
    body.set("confirmPassword", values.confirmPassword);

    try {
      const response = await fetch("/api/member-registration", {
        method: "POST",
        body,
      });

      const payload = (await response.json().catch(() => null)) as
        | (RegistrationSuccess & {
            fieldErrors?: Record<string, string[]>;
            message?: string;
          })
        | null;

      if (!response.ok) {
        if (payload?.fieldErrors) {
          Object.entries(payload.fieldErrors).forEach(([fieldName, messages]) => {
            const firstMessage = messages?.[0];

            if (firstMessage) {
              setError(fieldName as keyof MemberRegistrationValues, {
                type: "server",
                message: firstMessage,
              });
            }
          });
        }

        setSubmitError(
          payload?.message ??
            "We could not complete your registration right now. Please try again.",
        );
        return;
      }

      setSuccess(payload);
      reset(defaultValues);
    } catch {
      setSubmitError(
        "The registration request could not be completed. Check your connection and try again.",
      );
    } finally {
      setSubmitPhase(null);
    }
  });

  if (success) {
    return (
      <Card className="bg-card/90 shadow-[0_30px_80px_rgba(2,6,23,0.12)] backdrop-blur dark:shadow-[0_30px_80px_rgba(2,6,23,0.55)]">
        <CardHeader className="space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-200">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <CardTitle className="font-['Outfit'] text-3xl font-semibold tracking-tight">
            Registration complete
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            {success.fullName} can now sign in with the email and password used
            here, then complete next of kin and KYC from the member profile.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
              Member number
            </p>
            <p className="mt-3 font-['Outfit'] text-3xl font-semibold text-foreground">
              {success.memberNumber}
            </p>
            <p className="mt-2 text-sm text-emerald-100/80">{success.email}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button asChild size="lg">
              <Link href="/login">Go to sign in</Link>
            </Button>
            <Button
              className="w-full"
              onClick={() => setSuccess(null)}
              size="lg"
              type="button"
              variant="secondary"
            >
              Register another member
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/90 shadow-[0_30px_80px_rgba(2,6,23,0.12)] backdrop-blur dark:shadow-[0_30px_80px_rgba(2,6,23,0.55)]">
      <CardHeader className="space-y-5">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
          <ShieldCheck className="h-4 w-4" />
          Tier 1 onboarding
        </div>
        <div className="space-y-2">
          <CardTitle className="font-['Outfit'] text-3xl font-semibold tracking-tight">
            Create your member account
          </CardTitle>
        </div>
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

          <div className="rounded-3xl border border-border bg-secondary p-5">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Account access</p>
            </div>

            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  placeholder="Password"
                  type="password"
                  {...register("password")}
                />
                <FieldMessage message={errors.password?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  placeholder="Confirm password"
                  type="password"
                  {...register("confirmPassword")}
                />
                <FieldMessage message={errors.confirmPassword?.message} />
              </div>
            </div>
          </div>

          {submitError ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
              {submitError}
            </div>
          ) : null}

          {submitPhase ? (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
              {submitPhase}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-border pt-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild type="button" variant="outline">
                <Link href="/login">Back to sign in</Link>
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Create account"
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
