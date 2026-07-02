"use client";

import { type ChangeEvent, useEffect, useState, useTransition } from "react";
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
import { compressImageToWebp } from "@/lib/image-compression";
import {
  getMemberTierMeta,
  type MemberTier,
} from "@/lib/member-tier";
import {
  MAX_KYC_FILE_SIZE,
  memberKycSchema,
  memberNextOfKinSchema,
  type KycFieldName,
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
  isVerified: boolean;
  memberName: string;
  memberNumber: string | null;
  nextOfKin: {
    nextOfKinName: string;
    nextOfKinPhone: string;
    nextOfKinRelationship: string;
  };
  occupation: string;
  passportPhotoUrl: string | null;
  phone: string | null;
  tier: MemberTier;
};

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-700 dark:text-rose-200">{message}</p>;
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
          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100"
          : "border-amber-300/20 bg-amber-400/10 text-amber-800 dark:text-amber-100"
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
  isVerified,
  memberName,
  memberNumber,
  nextOfKin,
  occupation,
  passportPhotoUrl,
  phone,
  tier,
}: MemberProfilePageViewProps) {
  const router = useRouter();
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [kycMessage, setKycMessage] = useState<string | null>(null);
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycInputKey, setKycInputKey] = useState(0);
  const [isPreparingKyc, setIsPreparingKyc] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  const hasNextOfKinComplete = Boolean(
    nextOfKin.nextOfKinName &&
      nextOfKin.nextOfKinPhone &&
      nextOfKin.nextOfKinRelationship,
  );
  const hasKycComplete =
    kycStatus.nationalId && kycStatus.passportPhoto && kycStatus.utilityBill;
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

  async function handleKycFileChange(
    fieldName: KycFieldName,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget;
    const file = input.files?.item(0) ?? null;

    setKycError(null);
    setKycMessage(null);

    if (!file) {
      kycForm.setValue(fieldName, null, { shouldValidate: true });
      return;
    }

    setIsPreparingKyc(true);

    try {
      const preparedFile = await compressImageToWebp(file, MAX_KYC_FILE_SIZE);
      kycForm.setValue(fieldName, preparedFile, {
        shouldDirty: true,
        shouldValidate: true,
      });
    } catch (error) {
      input.value = "";
      kycForm.setValue(fieldName, null, { shouldValidate: true });
      setKycError(
        error instanceof Error
          ? error.message
          : "We could not prepare this file for upload.",
      );
    } finally {
      setIsPreparingKyc(false);
    }
  }

  return (
    <div className="space-y-6">
      {dataError ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">
          {dataError}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-border bg-card p-5 shadow-2xl shadow-black/10 dark:shadow-black/30 sm:rounded-[32px] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {passportPhotoUrl ? (
              <img
                alt={`${memberName} passport`}
                className="h-20 w-20 rounded-3xl border border-border object-cover shadow-lg shadow-black/10 dark:shadow-black/30"
                src={passportPhotoUrl}
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-border bg-secondary text-muted-foreground">
                <UserRound className="h-9 w-9" />
              </div>
            )}
            <div className="space-y-2">
              <Badge className="w-fit">{tierMeta.label}</Badge>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-['Outfit'] text-xl font-semibold text-foreground sm:text-3xl">
                    {memberName}
                  </h2>
                  {isVerified ? (
                    <Badge
                      className="border-sky-300/30 bg-sky-500/10 text-sky-700 dark:text-sky-100"
                      variant="outline"
                    >
                      Verified
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {memberNumber ?? "Member number pending"}
                </p>
              </div>
            </div>
          </div>

          <div className="w-full rounded-[28px] border border-emerald-400/15 bg-emerald-500/10 px-5 py-4 lg:w-auto">
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-100">
              Current tier
            </p>
            <p className="mt-2 font-['Outfit'] text-xl font-semibold text-foreground sm:text-2xl">
              {tierMeta.label} · {tierMeta.medal}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{tierMeta.nextStep}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatusPill
          complete={hasNextOfKinComplete}
          label="Next of kin"
        />
        <StatusPill complete={kycStatus.nationalId} label="National ID" />
        <StatusPill
          complete={hasKycComplete}
          label="KYC uploads"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <Badge className="w-fit" variant="secondary">
              Personal details
            </Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
              Your registration details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Full name
              </p>
              <p className="mt-2 text-sm text-foreground">{memberName}</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Member number
              </p>
              <p className="mt-2 text-sm text-foreground">
                {memberNumber ?? "Pending"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Email
              </p>
              <p className="mt-2 text-sm text-foreground">{email}</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Phone
              </p>
              <p className="mt-2 text-sm text-foreground">{phone ?? "Not added yet"}</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Date of birth
              </p>
              <p className="mt-2 text-sm text-foreground">{dateOfBirth}</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Occupation
              </p>
              <p className="mt-2 text-sm text-foreground">{occupation}</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4 sm:col-span-2">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Address
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">{address}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Badge className="w-fit">Tier progress</Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
              Access status
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-secondary px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="text-foreground">Savings and payments</span>
              <Badge variant="secondary">Enabled</Badge>
            </div>
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-secondary px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="text-foreground">Voting access</span>
              <Badge variant={tierMeta.canVote ? "secondary" : "outline"}>
                {tierMeta.canVote ? "Enabled" : "Locked"}
              </Badge>
            </div>
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-secondary px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="text-foreground">Loans and shares</span>
              <Badge
                variant={tierMeta.canAccessLoans && tierMeta.canAccessShares ? "secondary" : "outline"}
              >
                {tierMeta.canAccessLoans && tierMeta.canAccessShares
                  ? "Enabled"
                  : "Locked"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <UserRound className="h-5 w-5 text-amber-700 dark:text-amber-200" />
              <div>
                <CardTitle className="font-['Outfit'] text-2xl text-foreground">
                  Next of kin
                </CardTitle>
                <CardDescription>Tier 2</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {hasNextOfKinComplete ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-secondary px-4 py-4 sm:col-span-2">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    Next of kin name
                  </p>
                  <p className="mt-2 text-sm text-foreground">
                    {nextOfKin.nextOfKinName}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    Phone number
                  </p>
                  <p className="mt-2 text-sm text-foreground">
                    {nextOfKin.nextOfKinPhone}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    Relationship
                  </p>
                  <p className="mt-2 text-sm text-foreground">
                    {nextOfKin.nextOfKinRelationship}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100 sm:col-span-2">
                  Your next of kin details are already saved.
                </div>
              </div>
            ) : (
              <form className="space-y-5" onSubmit={saveNextOfKin}>
                <div className="space-y-2">
                  <Label htmlFor="nextOfKinName">Next of kin name</Label>
                  <Input
                    id="nextOfKinName"
                    placeholder="Full name"
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
                      placeholder="Phone number"
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
                      placeholder="Relationship"
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
                  <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
                    {profileError}
                  </div>
                ) : null}

                {profileMessage ? (
                  <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
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
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <UploadCloud className="h-5 w-5 text-emerald-700 dark:text-emerald-200" />
              <div>
                <CardTitle className="font-['Outfit'] text-2xl text-foreground">
                  KYC documents
                </CardTitle>
                <CardDescription>Tier 3 · 1MB maximum per file</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatusPill complete={kycStatus.nationalId} label="National ID" />
              <StatusPill
                complete={kycStatus.passportPhoto}
                label="Passport photo"
              />
              <StatusPill complete={kycStatus.utilityBill} label="Utility bill" />
            </div>

            {hasKycComplete ? (
              <div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-700 dark:text-emerald-100">
                Your KYC documents are already complete.
              </div>
            ) : (
              <form className="mt-5 space-y-5" onSubmit={uploadKyc}>
                {!kycStatus.nationalId ? (
                  <div className="space-y-2">
                    <Label htmlFor="nationalId">National ID</Label>
                    <Input
                      id="nationalId"
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      key={`national-id-${kycInputKey}`}
                      type="file"
                      onChange={(event) => void handleKycFileChange("nationalId", event)}
                    />
                    <FieldMessage message={kycForm.formState.errors.nationalId?.message} />
                  </div>
                ) : null}

                {!kycStatus.passportPhoto ? (
                  <div className="space-y-2">
                    <Label htmlFor="passportPhoto">Passport photo</Label>
                    <Input
                      id="passportPhoto"
                      accept=".jpg,.jpeg,.png,.webp"
                      key={`passport-photo-${kycInputKey}`}
                      type="file"
                      onChange={(event) =>
                        void handleKycFileChange("passportPhoto", event)
                      }
                    />
                    <FieldMessage
                      message={kycForm.formState.errors.passportPhoto?.message}
                    />
                  </div>
                ) : null}

                {!kycStatus.utilityBill ? (
                  <div className="space-y-2">
                    <Label htmlFor="utilityBill">Utility bill</Label>
                    <Input
                      id="utilityBill"
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      key={`utility-bill-${kycInputKey}`}
                      type="file"
                      onChange={(event) => void handleKycFileChange("utilityBill", event)}
                    />
                    <FieldMessage message={kycForm.formState.errors.utilityBill?.message} />
                  </div>
                ) : null}

                {kycError ? (
                  <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
                    {kycError}
                  </div>
                ) : null}

                {kycMessage ? (
                  <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
                    {kycMessage}
                  </div>
                ) : null}

                <Button
                  disabled={
                    kycForm.formState.isSubmitting ||
                    isPreparingKyc ||
                    isRefreshing
                  }
                  type="submit"
                >
                  {kycForm.formState.isSubmitting || isPreparingKyc ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isPreparingKyc ? "Preparing..." : "Uploading..."}
                    </>
                  ) : (
                    <>
                      <BadgeCheck className="mr-2 h-4 w-4" />
                      Upload KYC
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
