"use client";

import { staticApiFetch } from "@/lib/static-api";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type AdminLoanApplicationRow } from "@/lib/loans";
import { loanRejectionSchema } from "@/lib/validation/loans";

type RejectLoanFormValues = z.input<typeof loanRejectionSchema>;

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-200">{message}</p>;
}

export function RejectLoanDialog({
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
  } = useForm<RejectLoanFormValues>({
    resolver: zodResolver(loanRejectionSchema),
    defaultValues: {
      rejectionReason: "",
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    reset({
      rejectionReason: application?.rejectionReason ?? "",
    });
    setServerError(null);
  }, [application, open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!application) {
      return;
    }

    setServerError(null);

    const response = await staticApiFetch(
      `/api/admin/loan-applications/${application.id}/reject`,
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
        payload?.message ?? "Unable to reject the loan application right now.",
      );
      return;
    }

    onOpenChange(false);
    onCompleted(
      payload?.message ?? `${application.member.fullName}'s application was rejected.`,
    );
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject application</DialogTitle>
          <DialogDescription>
            Add a clear reason so the member and the admin team understand what
            needs to change before the application can return.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
            <p className="font-medium text-white">
              {application?.member.fullName ?? "Selected member"}
            </p>
            <p className="mt-1">
              {application?.product.name ?? "Loan product"} ·{" "}
              {application ? `${application.tenureMonths} months` : ""}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rejection-reason">Rejection reason</Label>
            <Textarea
              id="rejection-reason"
              className="min-h-[140px]"
              placeholder="Explain why the application cannot proceed right now."
              {...register("rejectionReason")}
            />
            <FieldMessage message={errors.rejectionReason?.message?.toString()} />
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
            <Button
              className="bg-rose-500 text-white shadow-rose-500/20 hover:bg-rose-400"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                "Reject application"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
