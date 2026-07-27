"use client";

import { staticApiFetch } from "@/lib/static-api";

import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import { formatNaira } from "@/lib/shares";
import { dividendDeclarationSchema } from "@/lib/validation/shares";

type DividendDeclarationFormValues = {
  financialYear: string;
  totalProfit: number | undefined;
};

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-200">{message}</p>;
}

const defaultValues: DividendDeclarationFormValues = {
  financialYear: "",
  totalProfit: undefined,
};

export function DividendDeclarationDialog({
  onCompleted,
  onOpenChange,
  open,
  totalSharesOutstanding,
}: {
  onCompleted: (message: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  totalSharesOutstanding: number;
}) {
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
    watch,
  } = useForm<DividendDeclarationFormValues>({
    resolver: zodResolver(dividendDeclarationSchema) as Resolver<DividendDeclarationFormValues>,
    defaultValues,
  });

  const totalProfit = Number(watch("totalProfit") ?? 0);

  useEffect(() => {
    if (!open) {
      return;
    }

    reset(defaultValues);
  }, [open, reset]);

  const estimatedDividendPerShare = useMemo(() => {
    if (totalProfit <= 0 || totalSharesOutstanding <= 0) {
      return 0;
    }

    return totalProfit / totalSharesOutstanding;
  }, [totalProfit, totalSharesOutstanding]);

  const onSubmit = handleSubmit(async (values) => {
    const response = await staticApiFetch("/api/admin/shares/dividends", {
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
      setError("root", {
        message:
          payload?.message ?? "Unable to declare dividends right now.",
      });
      return;
    }

    onOpenChange(false);
    onCompleted(payload?.message ?? "Dividend declared successfully.");
    reset(defaultValues);
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Declare Year-End Dividends</DialogTitle>
          <DialogDescription>
            Enter the financial year and total profit. The system calculates the
            dividend per share and creates a payment row for every member with
            issued shares.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="dividend-financial-year">Financial year</Label>
            <Input
              id="dividend-financial-year"
              placeholder="2026"
              {...register("financialYear")}
            />
            <FieldMessage message={errors.financialYear?.message?.toString()} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dividend-total-profit">Total profit</Label>
            <Input
              id="dividend-total-profit"
              min="0"
              placeholder="0.00"
              step="0.01"
              type="number"
              {...register("totalProfit", {
                valueAsNumber: true,
              })}
            />
            <FieldMessage message={errors.totalProfit?.message?.toString()} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-slate-950/60 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                Issued shares
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {totalSharesOutstanding.toLocaleString("en-NG")}
              </p>
            </div>

            <div className="rounded-3xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-200">
                Estimated dividend per share
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatNaira(estimatedDividendPerShare)}
              </p>
            </div>
          </div>

          {errors.root?.message ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {errors.root.message}
            </div>
          ) : null}

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="secondary">
              Cancel
            </Button>
            <Button
              disabled={isSubmitting || totalSharesOutstanding <= 0}
              type="submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                "Declare Dividend"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
