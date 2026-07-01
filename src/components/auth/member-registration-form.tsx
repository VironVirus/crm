"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, type Path, useForm } from "react-hook-form";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  UploadCloud,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  KYC_FIELD_CONFIG,
  type KycFieldName,
  MEMBER_REGISTRATION_STEPS,
  MEMBER_REGISTRATION_STEP_FIELDS,
  type MemberRegistrationFormValues,
  getStepIndexForField,
  memberRegistrationFormSchema,
} from "@/lib/validation/member-registration";

type RegistrationSuccess = {
  email: string;
  fullName: string;
  memberNumber: string;
};

const stepIcons = [UserRound, UsersRound, ShieldCheck, FileText];
const kycFieldNames = Object.keys(KYC_FIELD_CONFIG) as KycFieldName[];

const defaultValues: MemberRegistrationFormValues = {
  fullName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  address: "",
  occupation: "",
  nextOfKinName: "",
  nextOfKinPhone: "",
  nextOfKinRelationship: "",
  password: "",
  confirmPassword: "",
  nationalId: null,
  passportPhoto: null,
  utilityBill: null,
};

function formatFileSize(sizeInBytes: number) {
  if (sizeInBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeInBytes / 1024))} KB`;
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMimeTypes(fieldName: KycFieldName) {
  return KYC_FIELD_CONFIG[fieldName].accept
    .map((value) => value.replace("image/", "").replace("application/", ""))
    .map((value) => value.toUpperCase())
    .join(", ");
}

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-200">{message}</p>;
}

function StepMarker({
  index,
  isActive,
  isComplete,
}: {
  index: number;
  isActive: boolean;
  isComplete: boolean;
}) {
  if (isComplete) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20">
        <CheckCircle2 className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition ${
        isActive
          ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-200"
          : "border-white/10 bg-white/5 text-slate-400"
      }`}
    >
      {index + 1}
    </div>
  );
}

function KycDropzone({
  error,
  fieldName,
  onChange,
  value,
}: {
  error?: string;
  fieldName: KycFieldName;
  onChange: (file: File | null) => void;
  value: File | null | undefined;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const config = KYC_FIELD_CONFIG[fieldName];

  const applyFile = (fileList: FileList | null) => {
    const file = fileList?.item(0) ?? null;
    onChange(file);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-sm text-slate-100">{config.label}</Label>
        <p className="text-xs leading-5 text-slate-400">{config.description}</p>
      </div>

      <label
        className={`group flex cursor-pointer flex-col gap-3 rounded-3xl border border-dashed px-5 py-6 transition ${
          isDragging
            ? "border-emerald-300/50 bg-emerald-400/10"
            : "border-white/10 bg-white/[0.03] hover:border-emerald-400/30 hover:bg-white/[0.05]"
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          applyFile(event.dataTransfer.files);
        }}
      >
        <input
          accept={KYC_FIELD_CONFIG[fieldName].accept.join(",")}
          className="hidden"
          name={fieldName}
          onChange={(event) => applyFile(event.target.files)}
          type="file"
        />

        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-emerald-200">
            <UploadCloud className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">
              Drag and drop the file here, or click to browse.
            </p>
            <p className="text-xs text-slate-400">
              Accepted: {formatMimeTypes(fieldName)}. Maximum size: 10MB.
            </p>
          </div>
        </div>

        {value ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-100">{value.name}</p>
              <p className="text-xs text-slate-400">
                {formatFileSize(value.size)} · {value.type || "Unknown format"}
              </p>
            </div>
            <button
              className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-white/10"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange(null);
              }}
              type="button"
            >
              Remove
            </button>
          </div>
        ) : null}
      </label>

      <FieldMessage message={error} />
    </div>
  );
}

export function MemberRegistrationForm() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitPhase, setSubmitPhase] = useState<string | null>(null);
  const [success, setSuccess] = useState<RegistrationSuccess | null>(null);

  const {
    control,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    reset,
    setError,
    trigger,
    watch,
  } = useForm<MemberRegistrationFormValues>({
    resolver: zodResolver(memberRegistrationFormSchema),
    defaultValues,
    mode: "onTouched",
  });

  const watchedValues = watch();

  const goToNextStep = async () => {
    setStepError(null);
    setSubmitError(null);
    setIsAdvancing(true);

    const fields = [
      ...MEMBER_REGISTRATION_STEP_FIELDS[currentStep],
    ] as Path<MemberRegistrationFormValues>[];
    const isStepValid = await trigger(fields, { shouldFocus: true });

    setIsAdvancing(false);

    if (!isStepValid) {
      setStepError("Please correct the highlighted fields before continuing.");
      return;
    }

    setCurrentStep((previousStep) =>
      Math.min(previousStep + 1, MEMBER_REGISTRATION_STEPS.length - 1),
    );
  };

  const goToPreviousStep = () => {
    setStepError(null);
    setSubmitError(null);
    setCurrentStep((previousStep) => Math.max(previousStep - 1, 0));
  };

  const submitRegistration = handleSubmit(async (values) => {
    setStepError(null);
    setSubmitError(null);
    setSubmitPhase("Creating the member account and securing KYC documents...");

    const body = new FormData();
    body.set("fullName", values.fullName);
    body.set("email", values.email);
    body.set("phone", values.phone);
    body.set("dateOfBirth", values.dateOfBirth);
    body.set("address", values.address);
    body.set("occupation", values.occupation);
    body.set("nextOfKinName", values.nextOfKinName);
    body.set("nextOfKinPhone", values.nextOfKinPhone);
    body.set("nextOfKinRelationship", values.nextOfKinRelationship);
    body.set("password", values.password);
    body.set("confirmPassword", values.confirmPassword);

    if (values.nationalId) {
      body.set("nationalId", values.nationalId);
    }

    if (values.passportPhoto) {
      body.set("passportPhoto", values.passportPhoto);
    }

    if (values.utilityBill) {
      body.set("utilityBill", values.utilityBill);
    }

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
              setError(fieldName as Path<MemberRegistrationFormValues>, {
                type: "server",
                message: firstMessage,
              });
            }
          });

          const firstField = Object.keys(payload.fieldErrors)[0];
          const firstFieldStep = getStepIndexForField(firstField);

          if (firstFieldStep >= 0) {
            setCurrentStep(firstFieldStep);
          }
        }

        setSubmitError(
          payload?.message ||
            "We could not complete the registration right now. Please try again.",
        );
        return;
      }

      setSuccess(payload);
      reset(defaultValues);
      setCurrentStep(0);
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
      <Card className="border-white/10 bg-slate-950/75 text-white shadow-[0_30px_80px_rgba(2,6,23,0.55)] backdrop-blur">
        <CardHeader className="space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-200">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <CardTitle className="font-['Outfit'] text-3xl font-semibold tracking-tight">
            Registration complete
          </CardTitle>
          <p className="text-sm leading-6 text-slate-300">
            {success.fullName} has been registered successfully. The member can
            now use the email and password provided during registration to sign
            in.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
              Generated Member Number
            </p>
            <p className="mt-3 font-['Outfit'] text-3xl font-semibold text-white">
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
    <Card className="border-white/10 bg-slate-950/75 text-white shadow-[0_30px_80px_rgba(2,6,23,0.55)] backdrop-blur">
      <CardHeader className="space-y-5">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
          Multi-step onboarding
        </div>
        <div className="space-y-2">
          <CardTitle className="font-['Outfit'] text-3xl font-semibold tracking-tight">
            Register a new cooperative member
          </CardTitle>
          <p className="text-sm leading-6 text-slate-300">
            This registration flow creates the member's Supabase auth account,
            saves their profile and membership record, uploads KYC files to
            storage, and generates a member number after submission.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {MEMBER_REGISTRATION_STEPS.map((step, index) => {
            const Icon = stepIcons[index];
            const isActive = currentStep === index;
            const isComplete = currentStep > index;

            return (
              <div
                key={step.title}
                className={`flex items-start gap-4 rounded-3xl border p-4 transition ${
                  isActive
                    ? "border-emerald-300/30 bg-emerald-500/10"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <StepMarker
                  index={index}
                  isActive={isActive}
                  isComplete={isComplete}
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-slate-300" />
                    <p className="text-sm font-medium text-white">{step.title}</p>
                  </div>
                  <p className="text-xs leading-5 text-slate-400">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardHeader>

      <CardContent>
        <form className="space-y-6" onSubmit={submitRegistration}>
          {currentStep === 0 ? (
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    placeholder="Adaeze Okonkwo"
                    {...register("fullName")}
                  />
                  <FieldMessage message={errors.fullName?.message} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    placeholder="member@ifemelumma.coop"
                    type="email"
                    {...register("email")}
                  />
                  <FieldMessage message={errors.email?.message} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input
                    id="phone"
                    placeholder="+234 800 000 0000"
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
                    placeholder="Full residential address"
                    {...register("address")}
                  />
                  <FieldMessage message={errors.address?.message} />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="occupation">Occupation</Label>
                  <Input
                    id="occupation"
                    placeholder="Teacher, trader, farmer..."
                    {...register("occupation")}
                  />
                  <FieldMessage message={errors.occupation?.message} />
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">Account access</p>
                  <p className="text-xs leading-5 text-slate-400">
                    These credentials will be used for the member's portal
                    sign-in after registration.
                  </p>
                </div>

                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      placeholder="Choose a secure password"
                      type="password"
                      {...register("password")}
                    />
                    <FieldMessage message={errors.password?.message} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm password</Label>
                    <Input
                      id="confirmPassword"
                      placeholder="Repeat the password"
                      type="password"
                      {...register("confirmPassword")}
                    />
                    <FieldMessage message={errors.confirmPassword?.message} />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {currentStep === 1 ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="nextOfKinName">Next of kin name</Label>
                <Input
                  id="nextOfKinName"
                  placeholder="Chinedu Okonkwo"
                  {...register("nextOfKinName")}
                />
                <FieldMessage message={errors.nextOfKinName?.message} />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nextOfKinPhone">Next of kin phone number</Label>
                  <Input
                    id="nextOfKinPhone"
                    placeholder="+234 800 111 1111"
                    type="tel"
                    {...register("nextOfKinPhone")}
                  />
                  <FieldMessage message={errors.nextOfKinPhone?.message} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nextOfKinRelationship">Relationship</Label>
                  <Input
                    id="nextOfKinRelationship"
                    placeholder="Sibling, spouse, parent..."
                    {...register("nextOfKinRelationship")}
                  />
                  <FieldMessage
                    message={errors.nextOfKinRelationship?.message}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {currentStep === 2 ? (
            <div className="space-y-5">
              {kycFieldNames.map((fieldName) => (
                <Controller
                  control={control}
                  key={fieldName}
                  name={fieldName}
                  render={({ field }) => (
                    <KycDropzone
                      error={errors[fieldName]?.message as string | undefined}
                      fieldName={fieldName}
                      onChange={field.onChange}
                      value={field.value}
                    />
                  )}
                />
              ))}
            </div>
          ) : null}

          {currentStep === 3 ? (
            <div className="space-y-5">
              <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
                    Personal info
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-slate-200">
                    <p>{watchedValues.fullName}</p>
                    <p>{watchedValues.email}</p>
                    <p>{watchedValues.phone}</p>
                    <p>{watchedValues.dateOfBirth}</p>
                    <p>{watchedValues.occupation}</p>
                    <p className="leading-6 text-slate-300">{watchedValues.address}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
                    Next of kin
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-slate-200">
                    <p>{watchedValues.nextOfKinName}</p>
                    <p>{watchedValues.nextOfKinPhone}</p>
                    <p>{watchedValues.nextOfKinRelationship}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
                  Uploaded KYC files
                </p>
                <div className="mt-4 space-y-3">
                  {kycFieldNames.map((fieldName) => {
                    const file = watchedValues[fieldName];

                    return (
                      <div
                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3"
                        key={fieldName}
                      >
                        <div>
                          <p className="text-sm font-medium text-white">
                            {KYC_FIELD_CONFIG[fieldName].label}
                          </p>
                          <p className="text-xs text-slate-400">
                            {file?.name || "No file selected"}
                          </p>
                        </div>
                        {file ? (
                          <p className="text-xs text-slate-300">
                            {formatFileSize(file.size)}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {stepError ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {stepError}
            </div>
          ) : null}

          {submitError ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {submitError}
            </div>
          ) : null}

          {submitPhase ? (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {submitPhase}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-white/10 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-6 text-slate-400">
              {currentStep < MEMBER_REGISTRATION_STEPS.length - 1 ? (
                <span>
                  Step {currentStep + 1} of {MEMBER_REGISTRATION_STEPS.length}
                </span>
              ) : (
                <span>All details are ready for submission.</span>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild type="button" variant="outline">
                <Link href="/login">Back to sign in</Link>
              </Button>

              {currentStep > 0 ? (
                <Button
                  onClick={goToPreviousStep}
                  type="button"
                  variant="secondary"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Previous
                </Button>
              ) : null}

              {currentStep < MEMBER_REGISTRATION_STEPS.length - 1 ? (
                <Button
                  disabled={isAdvancing}
                  onClick={goToNextStep}
                  type="button"
                >
                  {isAdvancing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              ) : (
                <Button disabled={isSubmitting} type="submit">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      Submit registration
                      <CheckCircle2 className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
