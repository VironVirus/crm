"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreditCard, Loader2, PiggyBank } from "lucide-react";
import { useForm, type Resolver } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatPaymentAmount,
  type InitiatePaymentResponse,
  type MemberPaymentLoanOption,
  type MemberPaymentShareConfig,
  type PaymentType,
} from "@/lib/payments";
import { type MemberTier } from "@/lib/member-tier";
import { formatAccountTypeLabel } from "@/lib/savings";
import {
  memberPaymentFormSchema,
  type MemberPaymentFormValues,
} from "@/lib/validation/payments";

const SELECT_CLASS_NAME =
  "flex h-11 w-full rounded-2xl border border-input bg-background/70 px-4 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50";

const defaultValues: MemberPaymentFormValues = {
  accountType: "mandatory",
  amount: undefined,
  loanId: undefined,
  note: "",
  paymentType: "savings_deposit",
};

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-700 dark:text-rose-200">{message}</p>;
}

function formatPaymentTypeSummary(paymentType: PaymentType) {
  switch (paymentType) {
    case "savings_deposit":
      return "Add money directly into one of your savings balances.";
    case "loan_repayment":
      return "Settle part or all of your active loan from Flutterwave checkout.";
    case "share_purchase":
      return "Buy additional share units using the current cooperative share value.";
    default:
      return "";
  }
}

export function MakePaymentDialog({
  activeLoans,
  demoMode = false,
  memberId,
  memberName,
  memberNumber,
  memberTier,
  shareConfig,
}: {
  activeLoans: MemberPaymentLoanOption[];
  demoMode?: boolean;
  memberId: string;
  memberName: string;
  memberNumber: string | null;
  memberTier: MemberTier;
  shareConfig: MemberPaymentShareConfig | null;
}) {
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<MemberPaymentFormValues>({
    resolver: zodResolver(memberPaymentFormSchema) as Resolver<MemberPaymentFormValues>,
    defaultValues,
  });

  const paymentType = watch("paymentType");
  const amount = Number(watch("amount") ?? 0);
  const selectedLoanId = watch("loanId");
  const canAccessTierThreePayments = memberTier === "tier_3";

  useEffect(() => {
    if (!open) {
      return;
    }

    reset(defaultValues);
    setServerError(null);
  }, [open, reset]);

  useEffect(() => {
    if (canAccessTierThreePayments) {
      return;
    }

    if (paymentType !== "savings_deposit") {
      setValue("paymentType", "savings_deposit");
    }
  }, [canAccessTierThreePayments, paymentType, setValue]);

  useEffect(() => {
    if (
      paymentType === "loan_repayment" &&
      activeLoans.length > 0 &&
      !selectedLoanId
    ) {
      setValue("loanId", activeLoans[0].id, {
        shouldValidate: true,
      });
    }
  }, [activeLoans, paymentType, selectedLoanId, setValue]);

  const selectedLoan = useMemo(
    () => activeLoans.find((loan) => loan.id === selectedLoanId) ?? null,
    [activeLoans, selectedLoanId],
  );

  const projectedShareUnits =
    shareConfig && shareConfig.shareValue > 0 && amount > 0
      ? amount / shareConfig.shareValue
      : 0;
  const hasExactShareMultiple =
    shareConfig !== null &&
    projectedShareUnits > 0 &&
    Math.abs(projectedShareUnits - Math.round(projectedShareUnits)) <= 0.000001;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    if (
      values.paymentType === "loan_repayment" &&
      (!canAccessTierThreePayments || activeLoans.length === 0)
    ) {
      setServerError("You do not have an active loan available for repayment yet.");
      return;
    }

    if (values.paymentType === "share_purchase" && !canAccessTierThreePayments) {
      setServerError("Complete your profile to unlock share payments.");
      return;
    }

    if (values.paymentType === "share_purchase" && !shareConfig) {
      setServerError(
        "Share configuration is not available yet. Please contact the cooperative team.",
      );
      return;
    }

    const response = await fetch("/api/payments/initiate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Number(values.amount),
        member_id: memberId,
        metadata:
          values.paymentType === "savings_deposit"
            ? {
                account_type: values.accountType,
                narration: values.note || undefined,
              }
            : values.paymentType === "loan_repayment"
              ? {
                  loan_id: values.loanId,
                  narration: values.note || undefined,
                }
              : {
                  notes: values.note || undefined,
                },
        payment_type: values.paymentType,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | ({ message?: string } & Partial<InitiatePaymentResponse>)
      | null;

    if (!response.ok || !payload?.paymentLink) {
      setServerError(
        payload?.message ??
          "We could not open the payment checkout right now.",
      );
      return;
    }

    window.location.assign(payload.paymentLink);
  });

  const submitDisabled =
    isSubmitting ||
    (paymentType === "loan_repayment" &&
      (!canAccessTierThreePayments || activeLoans.length === 0)) ||
    (paymentType === "share_purchase" &&
      (!canAccessTierThreePayments ||
        !shareConfig ||
        (amount > 0 && !hasExactShareMultiple)));

  return (
    <>
      <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <CreditCard className="mr-2 h-4 w-4" />
        Make Payment
      </Button>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Make payment</DialogTitle>
            <DialogDescription>Flutterwave checkout</DialogDescription>
          </DialogHeader>

          <form className="space-y-5" onSubmit={onSubmit}>
            <div className="rounded-3xl border border-emerald-400/15 bg-emerald-500/10 p-4">
              <p className="font-medium text-foreground">{memberName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {memberNumber ?? "Member number pending"} · {demoMode ? "Demo checkout" : "Secure online payment"}
              </p>
              {!canAccessTierThreePayments ? (
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-100/90">
                  Tier 3 unlocks loan repayments and share purchases.
                </p>
              ) : null}
              {demoMode ? (
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-100/90">
                  Mock Flutterwave mode is on. Completing this checkout will post a demo payment inside the app.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-type">Payment type</Label>
              <select
                id="payment-type"
                className={SELECT_CLASS_NAME}
                {...register("paymentType")}
              >
                <option value="savings_deposit">
                  Savings deposit
                </option>
                {canAccessTierThreePayments ? (
                  <option value="loan_repayment">
                    Loan repayment
                  </option>
                ) : null}
                {canAccessTierThreePayments ? (
                  <option value="share_purchase">
                    Share purchase
                  </option>
                ) : null}
              </select>
              <p className="text-xs text-muted-foreground">
                {formatPaymentTypeSummary(paymentType)}
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="payment-amount">Amount</Label>
                <Input
                  id="payment-amount"
                  min="1"
                  step="0.01"
                  type="number"
                  {...register("amount", {
                    valueAsNumber: true,
                  })}
                />
                <FieldMessage message={errors.amount?.message?.toString()} />
              </div>

              <div className="rounded-3xl border border-border bg-secondary px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  Checkout amount
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {formatPaymentAmount(amount)}
                </p>
              </div>
            </div>

            {paymentType === "savings_deposit" ? (
              <div className="space-y-2">
                <Label htmlFor="payment-account-type">Savings account</Label>
                <select
                  id="payment-account-type"
                  className={SELECT_CLASS_NAME}
                  {...register("accountType")}
                >
                  <option value="mandatory">
                    Mandatory savings
                  </option>
                  <option value="voluntary">
                    Voluntary savings
                  </option>
                  <option value="fixed_deposit">
                    Fixed deposit
                  </option>
                </select>
                <FieldMessage message={errors.accountType?.message?.toString()} />
              </div>
            ) : null}

            {paymentType === "loan_repayment" ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="payment-loan">Active loan</Label>
                  <select
                    id="payment-loan"
                    className={SELECT_CLASS_NAME}
                    disabled={activeLoans.length === 0}
                    {...register("loanId")}
                  >
                    {activeLoans.length === 0 ? (
                      <option value="">
                        No active loans to repay
                      </option>
                    ) : null}
                    {activeLoans.map((loan) => (
                      <option
                        key={loan.id}
                        value={loan.id}
                      >
                        {loan.productName} · Outstanding {formatPaymentAmount(loan.outstandingBalance)}
                      </option>
                    ))}
                  </select>
                  <FieldMessage message={errors.loanId?.message?.toString()} />
                </div>

                {selectedLoan ? (
                  <div className="rounded-3xl border border-amber-300/15 bg-amber-400/10 p-4">
                    <p className="font-medium text-foreground">{selectedLoan.productName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Outstanding balance: {formatPaymentAmount(selectedLoan.outstandingBalance)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Scheduled monthly repayment: {formatPaymentAmount(selectedLoan.monthlyRepayment)}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-border bg-secondary p-4 text-sm text-muted-foreground">
                    You do not have an active loan available for repayment yet.
                  </div>
                )}
              </div>
            ) : null}

            {paymentType === "share_purchase" ? (
              <div className="rounded-3xl border border-border bg-secondary p-4">
                <div className="flex items-center gap-3 text-foreground">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
                    <PiggyBank className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">Share purchase preview</p>
                    <p className="text-sm text-muted-foreground">
                      {shareConfig
                        ? `${formatPaymentAmount(shareConfig.shareValue)} per share unit`
                        : "Share configuration unavailable"}
                    </p>
                  </div>
                </div>

                {shareConfig ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-background/70 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                        Estimated share units
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">
                        {projectedShareUnits > 0
                          ? hasExactShareMultiple
                            ? projectedShareUnits.toFixed(0)
                            : projectedShareUnits.toFixed(2)
                          : "0"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/70 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                        Minimum guidance
                      </p>
                      <p className="mt-2 text-lg font-semibold text-foreground">
                        {shareConfig.minimumShares} share
                        {shareConfig.minimumShares === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                ) : null}

                {shareConfig && amount > 0 && !hasExactShareMultiple ? (
                  <p className="mt-4 text-sm text-amber-700 dark:text-amber-200">
                    Enter an amount that matches the current share value exactly.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="payment-note">
                {paymentType === "share_purchase" ? "Notes" : "Narration"}
              </Label>
              <Textarea
                id="payment-note"
                className="min-h-[110px]"
                placeholder={
                  paymentType === "loan_repayment"
                    ? "Optional note for this repayment"
                    : paymentType === "share_purchase"
                      ? "Optional note for this share purchase"
                      : "Optional note for this deposit"
                }
                {...register("note")}
              />
            </div>

            {serverError ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
                {serverError}
              </div>
            ) : null}

            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button disabled={submitDisabled} type="submit">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Opening checkout
                  </>
                ) : (
                  "Continue to checkout"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
