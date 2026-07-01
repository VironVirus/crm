"use client";

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
import { Textarea } from "@/components/ui/textarea";
import { formatNaira, type ShareMemberOption } from "@/lib/shares";
import { sharePurchaseSchema } from "@/lib/validation/shares";

type SharePurchaseFormValues = {
  memberId: string;
  sharesCount: number | undefined;
  paymentReference?: string;
  notes?: string;
};

const SELECT_CLASS_NAME =
  "flex h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50";

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-200">{message}</p>;
}

const defaultValues: SharePurchaseFormValues = {
  memberId: "",
  sharesCount: undefined,
  paymentReference: "",
  notes: "",
};

export function SharePurchaseDialog({
  members,
  minimumShares,
  onCompleted,
  onOpenChange,
  open,
  shareValue,
}: {
  members: ShareMemberOption[];
  minimumShares: number;
  onCompleted: (message: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  shareValue: number;
}) {
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    watch,
    setError,
  } = useForm<SharePurchaseFormValues>({
    resolver: zodResolver(sharePurchaseSchema) as Resolver<SharePurchaseFormValues>,
    defaultValues,
  });

  const selectedMemberId = watch("memberId");
  const sharesCount = Number(watch("sharesCount") ?? 0);

  useEffect(() => {
    if (!open) {
      return;
    }

    reset(defaultValues);
  }, [open, reset]);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const projectedAmount = sharesCount * shareValue;

  const onSubmit = handleSubmit(async (values) => {
    const response = await fetch("/api/admin/shares/purchases", {
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
          payload?.message ??
          "Unable to record the share purchase right now.",
      });
      return;
    }

    onOpenChange(false);
    onCompleted(
      payload?.message ?? "Share purchase recorded successfully.",
    );
    reset(defaultValues);
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Share Purchase</DialogTitle>
          <DialogDescription>
            Select the member, enter the share units purchased, and the system
            will calculate the amount using the current configured share value.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="share-purchase-member">Member</Label>
            <select
              id="share-purchase-member"
              className={SELECT_CLASS_NAME}
              {...register("memberId")}
            >
              <option className="bg-slate-950 text-white" value="">
                Select a member
              </option>
              {members.map((member) => (
                <option
                  key={member.id}
                  className="bg-slate-950 text-white"
                  value={member.id}
                >
                  {member.fullName}
                  {member.memberNumber ? ` · ${member.memberNumber}` : ""}
                </option>
              ))}
            </select>
            <FieldMessage message={errors.memberId?.message?.toString()} />
          </div>

          {selectedMember ? (
            <div className="rounded-[24px] border border-emerald-400/15 bg-emerald-500/10 p-4">
              <p className="font-medium text-white">{selectedMember.fullName}</p>
              <p className="mt-1 text-sm text-slate-300">
                {selectedMember.memberNumber ?? "No member number"} · Currently
                holding {selectedMember.totalShares} share
                {selectedMember.totalShares === 1 ? "" : "s"}
              </p>
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="share-purchase-count">Share units</Label>
              <Input
                id="share-purchase-count"
                min="1"
                step="1"
                type="number"
                {...register("sharesCount", {
                  valueAsNumber: true,
                })}
              />
              <FieldMessage message={errors.sharesCount?.message?.toString()} />
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/60 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                Purchase amount
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatNaira(projectedAmount)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Based on {formatNaira(shareValue)} per share unit
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="share-purchase-reference">Payment reference</Label>
            <Input
              id="share-purchase-reference"
              placeholder="Optional reference"
              {...register("paymentReference")}
            />
            <FieldMessage message={errors.paymentReference?.message?.toString()} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="share-purchase-notes">Notes</Label>
            <Textarea
              id="share-purchase-notes"
              className="min-h-[120px]"
              placeholder="Optional notes for this purchase"
              {...register("notes")}
            />
            <FieldMessage message={errors.notes?.message?.toString()} />
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
            Minimum opening target: {minimumShares} share
            {minimumShares === 1 ? "" : "s"}.
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
            <Button disabled={isSubmitting || shareValue <= 0} type="submit">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                "Record Purchase"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
