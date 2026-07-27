"use client";

import { staticApiFetch } from "@/lib/static-api";

import { useEffect, useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Calculator,
  Clock4,
  Landmark,
  Loader2,
  PiggyBank,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type Resolver, useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import {
  calculateLoanEstimate,
  calculateMaximumEligibleLoan,
  formatCompactNaira,
  formatDisplayDate,
  formatGuarantorStatusLabel,
  formatLoanApplicationStatusLabel,
  formatLoanInterestTypeLabel,
  formatNaira,
  getGuarantorStatusTone,
  getLoanStatusTone,
  type GuarantorMemberOption,
  type LoanProductOption,
  type MemberLoanApplicationRow,
} from "@/lib/loans";
import {
  loanApplicationSchema,
} from "@/lib/validation/loans";

type LoanApplicationFormValues = {
  loanProductId: string;
  amountRequested: number | undefined;
  tenureMonths: number | undefined;
  purpose: string;
  guarantorMemberIds: string[];
};

const SELECT_CLASS_NAME =
  "flex h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50";

const LOAN_APPLICATION_STEPS = [
  {
    label: "Step 1",
    title: "Loan details",
    description: "Choose the product, amount, and repayment period.",
  },
  {
    label: "Step 2",
    title: "Purpose",
    description: "Explain what the loan supports.",
  },
  {
    label: "Step 3",
    title: "Guarantors",
    description: "Add up to two member guarantors.",
  },
  {
    label: "Step 4",
    title: "Review",
    description: "Confirm everything before submission.",
  },
] as const;

const defaultValues: LoanApplicationFormValues = {
  loanProductId: "",
  amountRequested: undefined,
  tenureMonths: undefined,
  purpose: "",
  guarantorMemberIds: [],
};

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-200">{message}</p>;
}

export default function MemberLoansPageView({
  applications,
  dataError,
  guarantorCandidates,
  loanProducts,
  memberName,
  memberNumber,
  savingsBalance,
}: {
  applications: MemberLoanApplicationRow[];
  dataError?: string | null;
  guarantorCandidates: GuarantorMemberOption[];
  loanProducts: LoanProductOption[];
  memberName: string;
  memberNumber: string | null;
  savingsBalance: number;
}) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [guarantorQuery, setGuarantorQuery] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successWarnings, setSuccessWarnings] = useState<string[]>([]);
  const [isRefreshing, startTransition] = useTransition();

  const {
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    trigger,
    watch,
    clearErrors,
  } = useForm<LoanApplicationFormValues>({
    resolver: zodResolver(loanApplicationSchema) as Resolver<LoanApplicationFormValues>,
    defaultValues,
  });

  useEffect(() => {
    register("guarantorMemberIds");
  }, [register]);

  const selectedLoanProductId = watch("loanProductId");
  const requestedAmount = Number(watch("amountRequested") ?? 0);
  const tenureMonths = Number(watch("tenureMonths") ?? 0);
  const purpose = watch("purpose");
  const guarantorMemberIds = watch("guarantorMemberIds") ?? [];

  useEffect(() => {
    if (loanProducts.length === 0 || selectedLoanProductId) {
      return;
    }

    setValue("loanProductId", loanProducts[0].id, {
      shouldValidate: true,
    });
    setValue("tenureMonths", loanProducts[0].minTenureMonths, {
      shouldValidate: true,
    });
  }, [loanProducts, selectedLoanProductId, setValue]);

  const selectedProduct = useMemo(
    () => loanProducts.find((product) => product.id === selectedLoanProductId) ?? null,
    [loanProducts, selectedLoanProductId],
  );

  const repaymentEstimate = useMemo(() => {
    if (!selectedProduct) {
      return {
        monthlyRepayment: 0,
        totalInterest: 0,
        totalRepayable: 0,
      };
    }

    return calculateLoanEstimate({
      annualInterestRate: selectedProduct.interestRate,
      interestType: selectedProduct.interestType,
      principal: requestedAmount,
      tenureMonths,
    });
  }, [requestedAmount, selectedProduct, tenureMonths]);

  const maxEligibleLoan = selectedProduct
    ? calculateMaximumEligibleLoan(
        savingsBalance,
        selectedProduct.maxLoanToSavingsRatio,
      )
    : 0;

  const selectedGuarantors = useMemo(
    () =>
      guarantorMemberIds
        .map((guarantorId) =>
          guarantorCandidates.find((candidate) => candidate.id === guarantorId) ?? null,
        )
        .filter((candidate): candidate is GuarantorMemberOption => Boolean(candidate)),
    [guarantorCandidates, guarantorMemberIds],
  );

  const filteredGuarantorCandidates = useMemo(() => {
    const normalizedQuery = guarantorQuery.trim().toLowerCase();

    return guarantorCandidates
      .filter((candidate) => !guarantorMemberIds.includes(candidate.id))
      .filter((candidate) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          candidate.fullName.toLowerCase().includes(normalizedQuery) ||
          candidate.memberNumber?.toLowerCase().includes(normalizedQuery) ||
          candidate.email.toLowerCase().includes(normalizedQuery)
        );
      })
      .slice(0, 8);
  }, [guarantorCandidates, guarantorMemberIds, guarantorQuery]);

  const guarantorLiabilityPreview =
    selectedGuarantors.length > 0 ? requestedAmount / selectedGuarantors.length : 0;

  const validateLoanRequest = (values: LoanApplicationFormValues) => {
    if (!selectedProduct) {
      setError("loanProductId", {
        message: "Choose a loan product before continuing.",
      });
      return false;
    }

    const amountRequestedValue = values.amountRequested ?? 0;
    const requestedTenureMonths = values.tenureMonths ?? 0;

    if (amountRequestedValue < selectedProduct.minAmount) {
      setError("amountRequested", {
        message: `Minimum amount for this product is ${formatNaira(
          selectedProduct.minAmount,
        )}.`,
      });
      return false;
    }

    if (amountRequestedValue > selectedProduct.maxAmount) {
      setError("amountRequested", {
        message: `Maximum amount for this product is ${formatNaira(
          selectedProduct.maxAmount,
        )}.`,
      });
      return false;
    }

    if (amountRequestedValue > maxEligibleLoan) {
      setError("amountRequested", {
        message: `Based on your current savings, your maximum eligible amount is ${formatNaira(
          maxEligibleLoan,
        )}.`,
      });
      return false;
    }

    if (requestedTenureMonths < selectedProduct.minTenureMonths) {
      setError("tenureMonths", {
        message: `Tenure must be at least ${selectedProduct.minTenureMonths} months.`,
      });
      return false;
    }

    if (requestedTenureMonths > selectedProduct.maxTenureMonths) {
      setError("tenureMonths", {
        message: `Tenure cannot exceed ${selectedProduct.maxTenureMonths} months.`,
      });
      return false;
    }

    return true;
  };

  const handleNextStep = async () => {
    setServerError(null);
    setSuccessMessage(null);
    setSuccessWarnings([]);

    if (currentStep === 0) {
      const isStepValid = await trigger([
        "loanProductId",
        "amountRequested",
        "tenureMonths",
      ]);

      if (!isStepValid || !validateLoanRequest(getValues())) {
        return;
      }
    }

    if (currentStep === 1) {
      const isStepValid = await trigger(["purpose"]);

      if (!isStepValid) {
        return;
      }
    }

    if (currentStep === 2) {
      const isStepValid = await trigger(["guarantorMemberIds"]);

      if (!isStepValid) {
        return;
      }
    }

    setCurrentStep((step) => Math.min(step + 1, LOAN_APPLICATION_STEPS.length - 1));
  };

  const handlePreviousStep = () => {
    setServerError(null);
    setSuccessMessage(null);
    setSuccessWarnings([]);
    setCurrentStep((step) => Math.max(step - 1, 0));
  };

  const handleAddGuarantor = (candidate: GuarantorMemberOption) => {
    if (guarantorMemberIds.length >= 2) {
      setError("guarantorMemberIds", {
        message: "You can add up to 2 guarantors to one application.",
      });
      return;
    }

    setValue("guarantorMemberIds", [...guarantorMemberIds, candidate.id], {
      shouldValidate: true,
    });
    setGuarantorQuery("");
    clearErrors("guarantorMemberIds");
  };

  const handleRemoveGuarantor = (guarantorId: string) => {
    setValue(
      "guarantorMemberIds",
      guarantorMemberIds.filter((memberId) => memberId !== guarantorId),
      { shouldValidate: true },
    );
    clearErrors("guarantorMemberIds");
  };

  const onSubmit = handleSubmit(async (values) => {
    if (!validateLoanRequest(values)) {
      setCurrentStep(0);
      return;
    }

    setServerError(null);
    setSuccessMessage(null);
    setSuccessWarnings([]);

    const response = await staticApiFetch("/api/loan-applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });

    const payload = (await response.json().catch(() => null)) as
      | { message?: string; warnings?: string[] }
      | null;

    if (!response.ok) {
      setServerError(
        payload?.message ??
          "We could not submit the loan application right now.",
      );
      return;
    }

    setSuccessMessage(
      payload?.message ??
        "Your loan application has been submitted for review.",
    );
    setSuccessWarnings(payload?.warnings ?? []);
    setCurrentStep(0);
    setGuarantorQuery("");
    reset({
      ...defaultValues,
      loanProductId: loanProducts[0]?.id ?? "",
      tenureMonths: loanProducts[0]?.minTenureMonths,
    });

    startTransition(() => {
      router.refresh();
    });
  });

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader className="space-y-4">
            <Badge className="w-fit">Loan application</Badge>
            <CardTitle className="font-['Outfit'] text-3xl text-white">
              Apply for a cooperative loan with confidence
            </CardTitle>
            <CardDescription className="max-w-2xl">
              {memberName}
              {memberNumber ? ` · ${memberNumber}` : ""}. Review the product
              terms, estimate your monthly repayment live, and submit once the
              numbers feel right.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-emerald-400/15 bg-emerald-500/10 p-4">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
                <PiggyBank size={18} />
              </div>
              <p className="text-sm text-slate-300">Current savings balance</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {formatNaira(savingsBalance)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-amber-200">
                <Clock4 size={18} />
              </div>
              <p className="text-sm text-slate-300">Applications on file</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {applications.length}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-sky-200">
                <Landmark size={18} />
              </div>
              <p className="text-sm text-slate-300">Available products</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {loanProducts.length}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader>
            <Badge variant="secondary" className="w-fit">
              Live estimate
            </Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-white">
              What your repayment could look like
            </CardTitle>
            <CardDescription>
              The exact repayment schedule is generated during approval, but
              this estimate uses the same formula the cooperative applies to the
              selected product.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-[28px] border border-emerald-400/15 bg-emerald-500/10 p-5">
              <p className="text-xs uppercase tracking-[0.28em] text-emerald-200">
                Estimated monthly repayment
              </p>
              <p className="mt-3 font-['Outfit'] text-3xl font-semibold text-white">
                {formatNaira(repaymentEstimate.monthlyRepayment)}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Total repayable
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {formatNaira(repaymentEstimate.totalRepayable)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Total interest
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {formatNaira(repaymentEstimate.totalInterest)}
                </p>
              </div>
            </div>

            {selectedProduct ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <Calculator className="mt-0.5 h-4 w-4 text-emerald-200" />
                  <div className="space-y-2">
                    <p className="font-medium text-white">{selectedProduct.name}</p>
                    <p>
                      {selectedProduct.interestRate.toFixed(2)}%{" "}
                      {formatLoanInterestTypeLabel(selectedProduct.interestType).toLowerCase()}{" "}
                      interest · tenure range {selectedProduct.minTenureMonths}-
                      {selectedProduct.maxTenureMonths} months.
                    </p>
                    <p>
                      Maximum eligible amount from your current savings:
                      <span className="ml-2 font-medium text-white">
                        {formatNaira(maxEligibleLoan)}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {dataError ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {dataError}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader>
            <Badge variant="secondary" className="w-fit">
              New request
            </Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-white">
              Submit a new loan application
            </CardTitle>
            <CardDescription>
              Move through the loan details, purpose, guarantors, and review
              stages without leaving this page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 md:grid-cols-4">
              {LOAN_APPLICATION_STEPS.map((step, index) => {
                const isActive = currentStep === index;
                const isComplete = currentStep > index;

                return (
                  <div
                    key={step.label}
                    className={`rounded-3xl border px-4 py-4 transition ${
                      isActive
                        ? "border-emerald-400/30 bg-emerald-500/10"
                        : isComplete
                          ? "border-emerald-400/20 bg-white/[0.05]"
                          : "border-white/10 bg-slate-950/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                        {step.label}
                      </p>
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium ${
                          isActive || isComplete
                            ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
                            : "border-white/10 bg-white/5 text-slate-300"
                        }`}
                      >
                        {index + 1}
                      </span>
                    </div>
                    <p className="mt-3 font-medium text-white">{step.title}</p>
                    <p className="mt-1 text-sm text-slate-300">{step.description}</p>
                  </div>
                );
              })}
            </div>

            <form className="space-y-6" onSubmit={onSubmit}>
              {currentStep === 0 ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="loan-product">Loan product</Label>
                    <select
                      id="loan-product"
                      className={SELECT_CLASS_NAME}
                      {...register("loanProductId")}
                    >
                      <option className="bg-slate-950 text-white" value="">
                        Select a loan product
                      </option>
                      {loanProducts.map((product) => (
                        <option
                          key={product.id}
                          className="bg-slate-950 text-white"
                          value={product.id}
                        >
                          {product.name}
                        </option>
                      ))}
                    </select>
                    <FieldMessage message={errors.loanProductId?.message?.toString()} />
                  </div>

                  {selectedProduct ? (
                    <div className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/50 p-4 md:grid-cols-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                          Interest
                        </p>
                        <p className="mt-2 text-sm font-medium text-white">
                          {selectedProduct.interestRate.toFixed(2)}%{" "}
                          {formatLoanInterestTypeLabel(selectedProduct.interestType)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                          Product range
                        </p>
                        <p className="mt-2 text-sm font-medium text-white">
                          {formatCompactNaira(selectedProduct.minAmount)} -{" "}
                          {formatCompactNaira(selectedProduct.maxAmount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                          Tenure range
                        </p>
                        <p className="mt-2 text-sm font-medium text-white">
                          {selectedProduct.minTenureMonths}-
                          {selectedProduct.maxTenureMonths} months
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="loan-amount">Amount requested</Label>
                      <Input
                        id="loan-amount"
                        min="0"
                        placeholder="0.00"
                        step="0.01"
                        type="number"
                        {...register("amountRequested", {
                          valueAsNumber: true,
                        })}
                      />
                      <FieldMessage message={errors.amountRequested?.message?.toString()} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="loan-tenure">Tenure in months</Label>
                      <Input
                        id="loan-tenure"
                        min="1"
                        placeholder="12"
                        step="1"
                        type="number"
                        {...register("tenureMonths", {
                          valueAsNumber: true,
                        })}
                      />
                      <FieldMessage message={errors.tenureMonths?.message?.toString()} />
                    </div>
                  </div>
                </div>
              ) : null}

              {currentStep === 1 ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="loan-purpose">Purpose</Label>
                    <Textarea
                      id="loan-purpose"
                      className="min-h-[160px]"
                      placeholder="Describe what the loan will be used for and how it supports your cooperative activity."
                      {...register("purpose")}
                    />
                    <FieldMessage message={errors.purpose?.message?.toString()} />
                  </div>

                  <div className="rounded-3xl border border-emerald-400/15 bg-emerald-500/10 p-4 text-sm text-slate-200">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-200" />
                      <p>
                        A clear purpose helps the loan review team move faster
                        and gives guarantors enough context before they respond
                        to your invitation.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {currentStep === 2 ? (
                <div className="space-y-5">
                  <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                    <div className="flex items-start gap-3">
                      <Users className="mt-0.5 h-4 w-4 text-emerald-200" />
                      <p>
                        Add up to 2 guarantors. Each selected member receives a
                        pending request on their portal, and SMS/email delivery
                        is sent when the notification secrets are configured.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="guarantor-search">Find guarantors</Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="guarantor-search"
                        className="pl-11"
                        onChange={(event) => setGuarantorQuery(event.target.value)}
                        placeholder="Search by member name, number, or email"
                        value={guarantorQuery}
                      />
                    </div>
                    <FieldMessage message={errors.guarantorMemberIds?.message?.toString()} />
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-2">
                    {filteredGuarantorCandidates.length > 0 ? (
                      filteredGuarantorCandidates.map((candidate) => (
                        <button
                          key={candidate.id}
                          className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-white/5"
                          onClick={(event) => {
                            event.preventDefault();
                            handleAddGuarantor(candidate);
                          }}
                          type="button"
                        >
                          <div>
                            <p className="font-medium text-white">{candidate.fullName}</p>
                            <p className="text-xs text-slate-400">
                              {candidate.memberNumber ?? "Member number pending"} ·{" "}
                              {candidate.email}
                            </p>
                          </div>
                          <span className="text-xs uppercase tracking-[0.22em] text-emerald-200">
                            Add
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-5 text-sm text-slate-400">
                        No eligible members match that search yet.
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-white">Selected guarantors</p>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-300">
                        {selectedGuarantors.length}/2 added
                      </span>
                    </div>

                    {selectedGuarantors.length > 0 ? (
                      selectedGuarantors.map((guarantor) => (
                        <div
                          key={guarantor.id}
                          className="rounded-3xl border border-white/10 bg-slate-950/60 p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-medium text-white">
                                {guarantor.fullName}
                              </p>
                              <p className="text-sm text-slate-300">
                                {guarantor.memberNumber ?? "Member number pending"} ·{" "}
                                {guarantor.email}
                              </p>
                            </div>
                            <Button
                              onClick={() => handleRemoveGuarantor(guarantor.id)}
                              type="button"
                              variant="secondary"
                            >
                              Remove
                            </Button>
                          </div>
                          <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-3 text-sm text-slate-200">
                            Estimated liability share:{" "}
                            <span className="font-medium text-white">
                              {formatNaira(guarantorLiabilityPreview)}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-4 py-10 text-center text-sm text-slate-400">
                        No guarantors added yet. You can still continue if your
                        cooperative policy allows it.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {currentStep === 3 ? (
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Loan product
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {selectedProduct?.name ?? "Not selected"}
                      </p>
                      <p className="mt-2 text-sm text-slate-300">
                        {selectedProduct
                          ? `${selectedProduct.interestRate.toFixed(2)}% ${formatLoanInterestTypeLabel(
                              selectedProduct.interestType,
                            ).toLowerCase()} interest`
                          : "Choose a product to see the review summary."}
                      </p>
                    </div>

                    <div className="rounded-3xl border border-emerald-400/15 bg-emerald-500/10 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-emerald-200">
                        Monthly estimate
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {formatNaira(repaymentEstimate.monthlyRepayment)}
                      </p>
                      <p className="mt-2 text-sm text-slate-200">
                        Total repayable: {formatNaira(repaymentEstimate.totalRepayable)}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Amount
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {formatNaira(requestedAmount)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Tenure
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {tenureMonths} months
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Guarantors
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {selectedGuarantors.length}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      Purpose
                    </p>
                    <p className="mt-3 text-sm leading-7 text-slate-200">
                      {purpose || "No purpose added yet."}
                    </p>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-white">Guarantor review</p>
                      <span className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Pending invite count: {selectedGuarantors.length}
                      </span>
                    </div>

                    {selectedGuarantors.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {selectedGuarantors.map((guarantor) => (
                          <div
                            key={guarantor.id}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-200"
                          >
                            <p className="font-medium text-white">{guarantor.fullName}</p>
                            <p className="mt-1 text-slate-300">
                              {guarantor.memberNumber ?? "Member number pending"} ·{" "}
                              {guarantor.email}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-slate-300">
                        No guarantors selected for this application.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              {serverError ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {serverError}
                </div>
              ) : null}

              {successMessage ? (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  {successMessage}
                </div>
              ) : null}

              {successWarnings.length > 0 ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {successWarnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <div className="flex gap-3">
                  <Button
                    disabled={currentStep === 0 || isSubmitting || isRefreshing}
                    onClick={handlePreviousStep}
                    type="button"
                    variant="secondary"
                  >
                    Back
                  </Button>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  {currentStep < LOAN_APPLICATION_STEPS.length - 1 ? (
                    <Button
                      disabled={
                        isSubmitting ||
                        isRefreshing ||
                        loanProducts.length === 0 ||
                        !selectedProduct
                      }
                      onClick={handleNextStep}
                      type="button"
                    >
                      Continue
                    </Button>
                  ) : (
                    <Button
                      disabled={
                        isSubmitting ||
                        isRefreshing ||
                        loanProducts.length === 0 ||
                        !selectedProduct
                      }
                      type="submit"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting
                        </>
                      ) : (
                        "Submit application"
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader>
            <Badge variant="secondary" className="w-fit">
              Application history
            </Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-white">
              Recent requests and current standing
            </CardTitle>
            <CardDescription>
              Track every loan request you have submitted and see where it
              currently sits in the review process.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {applications.length > 0 ? (
              applications.map((application) => (
                <div
                  key={application.id}
                  className="rounded-3xl border border-white/10 bg-slate-950/60 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-white">
                          {application.productName}
                        </p>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${getLoanStatusTone(
                            application.status,
                          )}`}
                        >
                          {formatLoanApplicationStatusLabel(application.status)}
                        </span>
                      </div>
                      <p className="text-sm leading-6 text-slate-300">
                        {application.purpose}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Applied
                      </p>
                      <p className="mt-2 font-medium text-white">
                        {formatDisplayDate(application.appliedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Amount
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {formatNaira(application.amountRequested)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Tenure
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {application.tenureMonths} months
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Estimate
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {formatNaira(application.monthlyRepaymentEstimate)}/month
                      </p>
                    </div>
                  </div>

                  {application.guarantors.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Guarantor status
                      </p>
                      {application.guarantors.map((guarantor) => (
                        <div
                          key={guarantor.id}
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-200"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-medium text-white">
                                {guarantor.fullName}
                              </p>
                              <p className="mt-1 text-slate-300">
                                {guarantor.memberNumber ?? "Member number pending"} ·{" "}
                                Liability {formatNaira(guarantor.liabilityAmount)}
                              </p>
                            </div>
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-medium ${getGuarantorStatusTone(
                                guarantor.status,
                              )}`}
                            >
                              {formatGuarantorStatusLabel(guarantor.status)}
                            </span>
                          </div>
                          <p className="mt-3 text-xs text-slate-400">
                            Invited {formatDisplayDate(guarantor.invitedAt)}
                            {guarantor.respondedAt
                              ? ` · Responded ${formatDisplayDate(guarantor.respondedAt)}`
                              : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {application.rejectionReason ? (
                    <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                      {application.rejectionReason}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-10 text-center text-sm text-slate-400">
                No loan applications submitted yet.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
