"use client";

import { useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Resolver, useForm } from "react-hook-form";
import {
  BadgeCheck,
  Loader2,
  ShieldCheck,
  UploadCloud,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getMemberTierMeta,
  getTierUpgradeLabel,
  type MemberTier,
} from "@/lib/member-tier";
import {
  memberKycSchema,
  memberNextOfKinSchema,
  type MemberKycValues,
  type MemberNextOfKinValues,
} from "@/lib/validation/member-registration";

type MemberProfilePageViewProps = {
  address: string;
  dataError?: string | null;
  dateOfBirth: string;
  email: string;
  kycStatus: {
    nationalId: boolean;
    passportPhoto: boolean;
    utilityBill: boolean;
  };
  memberName: string;
  memberNumber: string | null;
  nextOfKin: {
    nextOfKinName: string;
    nextOfKinPhone: string;
    nextOfKinRelationship: string;
  };
  occupation: string;
  phone: string | null;
  tier: MemberTier;
};

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-200">{message}</p>;
}

function StatusPill({
  complete,
  label,
}: {
  complete: boolean;
  label: string;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        complete
          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
          : "border-amber-300/20 bg-amber-400/10 text-amber-100"
      }`}
    >
      <p className="font-medium">{label}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.22em]">
        {complete ? "Completed" : "Pending"}
      </p>
    </div>
  );
}

export default function MemberProfilePageView({
  address,
  dataError,
  dateOfBirth,
  email,
  kycStatus,
  memberName,
  memberNumber,
  nextOfKin,
  occupation,
  phone,
  tier,
}: MemberProfilePageViewProps) {
  const router = useRouter();
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [kycMessage, setKycMessage] = useState<string | null>(null);
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycInputKey, setKycInputKey] = useState(0);
  const [isRefreshing, startTransition] = useTransition();
  const tierMeta = getMemberTierMeta(tier);

  const nextOfKinForm = useForm<MemberNextOfKinValues>({
    resolver: zodResolver(memberNextOfKinSchema),
    defaultValues: nextOfKin,
    mode: "onTouched",
  });

  const kycForm = useForm<MemberKycValues>({
    resolver: zodResolver(memberKycSchema) as Resolver<MemberKycValues>,
    defaultValues: {
      nationalId: null,
      passportPhoto: null,
      utilityBill: null,
    },
    mode: "onTouched",
  });

  useEffect(() => {
    nextOfKinForm.reset(nextOfKin);
  }, [nextOfKin, nextOfKinForm]);

  const saveNextOfKin = nextOfKinForm.handleSubmit(async (values) => {
    setProfileError(null);
    setProfileMessage(null);

    const response = await fetch("/api/portal/profile/next-of-kin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });

    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setProfileError(
        payload?.message ??
          "We could not save your next of kin details right now.",
      );
      return;
    }

    setProfileMessage(
      payload?.message ?? "Your next of kin details have been saved.",
    );
    startTransition(() => {
      router.refresh();
    });
  });

  const uploadKyc = kycForm.handleSubmit(async (values) => {
    setKycError(null);
    setKycMessage(null);

    const body = new FormData();

    if (values.nationalId) {
      body.set("nationalId", values.nationalId);
    }

    if (values.passportPhoto) {
      body.set("passportPhoto", values.passportPhoto);
    }

    if (values.utilityBill) {
      body.set("utilityBill", values.utilityBill);
    }

    const response = await fetch("/api/portal/profile/kyc", {
      method: "POST",
      body,
    });

    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setKycError(
        payload?.message ?? "We could not upload your KYC documents right now.",
      );
      return;
    }

    setKycMessage(payload?.message ?? "Your KYC documents have been uploaded.");
    kycForm.reset({
      nationalId: null,
      passportPhoto: null,
      utilityBill: null,
    });
    setKycInputKey((current) => current + 1);
    startTransition(() => {
      router.refresh();
    });
  });

  return (
    <div className="space-y-6">
      {dataError ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {dataError}
        </div>
      ) : null}

      <section className="rounded-[32px] border border-white/15 bg-[#111827] p-6 shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge className="w-fit">{tierMeta.label}</Badge>
            <div>
              <h2 className="font-['Outfit'] text-3xl font-semibold text-white">
                {memberName}
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                {memberNumber ?? "Member number pending"}
              </p>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-200">
              {tierMeta.description}
            </p>
          </div>

          <div className="rounded-[28px] border border-emerald-400/15 bg-emerald-500/10 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-200">
              {getTierUpgradeLabel(tier)}
            </p>
            <p className="mt-2 font-['Outfit'] text-2xl font-semibold text-white">
              {tierMeta.medal} member
            </p>
            <p className="mt-1 text-sm text-slate-200">{tierMeta.nextStep}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatusPill
          complete={Boolean(
            nextOfKin.nextOfKinName &&
              nextOfKin.nextOfKinPhone &&
              nextOfKin.nextOfKinRelationship,
          )}
          label="Next of kin"
        />
        <StatusPill complete={kycStatus.nationalId} label="National ID" />
        <StatusPill
          complete={kycStatus.passportPhoto && kycStatus.utilityBill}
          label="KYC uploads"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <Badge className="w-fit" variant="secondary">
              Personal details
            </Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-white">
              Your registration details
            </CardTitle>
            <CardDescription className="text-slate-200">
              These are the details currently stored on your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                Email
              </p>
              <p className="mt-2 text-sm text-white">{email}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                Phone
              </p>
              <p className="mt-2 text-sm text-white">{phone ?? "Not added yet"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                Date of birth
              </p>
              <p className="mt-2 text-sm text-white">{dateOfBirth}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                Occupation
              </p>
              <p className="mt-2 text-sm text-white">{occupation}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 sm:col-span-2">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                Address
              </p>
              <p className="mt-2 text-sm leading-6 text-white">{address}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <Badge className="w-fit">Tier progress</Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-white">
              What each tier unlocks
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-200">
              Tier 1: savings, payments, statements, and notifications.
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-200">
              Tier 2: everything in Tier 1 plus governance and voting access.
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-200">
              Tier 3: full portal access, including loans and shares.
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <UserRound className="h-5 w-5 text-amber-200" />
              <div>
                <CardTitle className="font-['Outfit'] text-2xl text-white">
                  Add next of kin
                </CardTitle>
                <CardDescription className="text-slate-200">
                  Completing this unlocks Tier 2.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={saveNextOfKin}>
              <div className="space-y-2">
                <Label htmlFor="nextOfKinName">Next of kin name</Label>
                <Input
                  id="nextOfKinName"
                  placeholder="Chinedu Okonkwo"
                  {...nextOfKinForm.register("nextOfKinName")}
                />
                <FieldMessage
                  message={nextOfKinForm.formState.errors.nextOfKinName?.message}
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nextOfKinPhone">Phone number</Label>
                  <Input
                    id="nextOfKinPhone"
                    placeholder="+234 800 111 1111"
                    type="tel"
                    {...nextOfKinForm.register("nextOfKinPhone")}
                  />
                  <FieldMessage
                    message={nextOfKinForm.formState.errors.nextOfKinPhone?.message}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nextOfKinRelationship">Relationship</Label>
                  <Input
                    id="nextOfKinRelationship"
                    placeholder="Sibling, spouse, parent..."
                    {...nextOfKinForm.register("nextOfKinRelationship")}
                  />
                  <FieldMessage
                    message={
                      nextOfKinForm.formState.errors.nextOfKinRelationship?.message
                    }
                  />
                </div>
              </div>

              {profileError ? (
                <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {profileError}
                </div>
              ) : null}

              {profileMessage ? (
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  {profileMessage}
                </div>
              ) : null}

              <Button
                disabled={nextOfKinForm.formState.isSubmitting || isRefreshing}
                type="submit"
              >
                {nextOfKinForm.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save next of kin"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <UploadCloud className="h-5 w-5 text-emerald-200" />
              <div>
                <CardTitle className="font-['Outfit'] text-2xl text-white">
                  Upload KYC
                </CardTitle>
                <CardDescription className="text-slate-200">
                  Completing this unlocks Tier 3.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={uploadKyc}>
              <div className="space-y-2">
                <Label htmlFor="nationalId">National ID</Label>
                <Input
                  id="nationalId"
                  accept=".jpg,.jpeg,.png,.pdf"
                  key={`national-id-${kycInputKey}`}
                  type="file"
                  onChange={(event) =>
                    kycForm.setValue(
                      "nationalId",
                      event.target.files?.item(0) ?? null,
                      { shouldValidate: true },
                    )
                  }
                />
                <FieldMessage message={kycForm.formState.errors.nationalId?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="passportPhoto">Passport photo</Label>
                <Input
                  id="passportPhoto"
                  accept=".jpg,.jpeg,.png,.webp"
                  key={`passport-photo-${kycInputKey}`}
                  type="file"
                  onChange={(event) =>
                    kycForm.setValue(
                      "passportPhoto",
                      event.target.files?.item(0) ?? null,
                      { shouldValidate: true },
                    )
                  }
                />
                <FieldMessage
                  message={kycForm.formState.errors.passportPhoto?.message}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="utilityBill">Utility bill</Label>
                <Input
                  id="utilityBill"
                  accept=".jpg,.jpeg,.png,.pdf"
                  key={`utility-bill-${kycInputKey}`}
                  type="file"
                  onChange={(event) =>
                    kycForm.setValue(
                      "utilityBill",
                      event.target.files?.item(0) ?? null,
                      { shouldValidate: true },
                    )
                  }
                />
                <FieldMessage message={kycForm.formState.errors.utilityBill?.message} />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <StatusPill complete={kycStatus.nationalId} label="National ID" />
                <StatusPill
                  complete={kycStatus.passportPhoto}
                  label="Passport photo"
                />
                <StatusPill complete={kycStatus.utilityBill} label="Utility bill" />
              </div>

              {kycError ? (
                <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {kycError}
                </div>
              ) : null}

              {kycMessage ? (
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  {kycMessage}
                </div>
              ) : null}

              <Button disabled={kycForm.formState.isSubmitting || isRefreshing} type="submit">
                {kycForm.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <BadgeCheck className="mr-2 h-4 w-4" />
                    Upload KYC
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
