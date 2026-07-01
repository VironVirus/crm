"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { formatNaira, type AdminLoanApplicationRow } from "@/lib/loans";
import { loanDisbursementSchema } from "@/lib/validation/loans";

type LoanDisbursementFormValues = z.input<typeof loanDisbursementSchema>;

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-200">{message}</p>;
}

export function DisburseLoanDialog({
  application,
  onCompleted,
  onOpenChange,
  open,
}: {
  application: AdminLoanApplicationRow | null;
  onCompleted: (message: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<LoanDisbursementFormValues>({
    resolver: zodResolver(loanDisbursementSchema),
    defaultValues: {
      amount: undefined,
      narration: "",
      transferReference: "",
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    reset({
      amount: application?.loan?.principalAmount ?? application?.amountRequested,
      narration: application
        ? `Loan disbursement for ${application.member.fullName}`
        : "",
      transferReference: "",
    });
    setServerError(null);
  }, [application, open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!application) {
      return;
    }

    setServerError(null);

    const response = await fetch(
      `/api/admin/loan-applications/${application.id}/disburse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setServerError(
        payload?.message ?? "Unable to record the disbursement right now.",
      );
      return;
    }

    onOpenChange(false);
    onCompleted(
      payload?.message ??
        `${application.member.fullName}'s loan was disbursed successfully.`,
    );
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flutterwave disbursement</DialogTitle>
          <DialogDescription>
            Record the payout details from Flutterwave, then the loan is marked
            as disbursed and its repayment schedule is refreshed from the
            disbursement date.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="rounded-3xl border border-emerald-400/15 bg-emerald-500/10 p-4 text-sm text-slate-200">
            <p className="font-medium text-white">
              {application?.member.fullName ?? "Selected member"}
            </p>
            <p className="mt-1">
              Approved amount:{" "}
              <span className="font-medium text-white">
                {formatNaira(
                  application?.loan?.principalAmount ?? application?.amountRequested ?? 0,
                )}
              </span>
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="disbursement-amount">Amount disbursed</Label>
              <Input
                id="disbursement-amount"
                min="0"
                placeholder="0.00"
                step="0.01"
                type="number"
                {...register("amount")}
              />
              <FieldMessage message={errors.amount?.message?.toString()} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="transfer-reference">Flutterwave reference</Label>
              <Input
                id="transfer-reference"
                placeholder="FLW-TRF-..."
                {...register("transferReference")}
              />
              <FieldMessage message={errors.transferReference?.message?.toString()} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="disbursement-narration">Narration</Label>
            <Textarea
              id="disbursement-narration"
              className="min-h-[120px]"
              placeholder="Add a short note describing this payout."
              {...register("narration")}
            />
            <FieldMessage message={errors.narration?.message?.toString()} />
          </div>

          {serverError ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {serverError}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                "Record disbursement"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
