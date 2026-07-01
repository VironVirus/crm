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
import { shareTransferSchema } from "@/lib/validation/shares";

type ShareTransferFormValues = {
  fromMemberId: string;
  toMemberId: string;
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

const defaultValues: ShareTransferFormValues = {
  fromMemberId: "",
  toMemberId: "",
  sharesCount: undefined,
  paymentReference: "",
  notes: "",
};

export function ShareTransferDialog({
  members,
  onCompleted,
  onOpenChange,
  open,
  shareValue,
}: {
  members: ShareMemberOption[];
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
    setError,
    watch,
  } = useForm<ShareTransferFormValues>({
    resolver: zodResolver(shareTransferSchema) as Resolver<ShareTransferFormValues>,
    defaultValues,
  });

  const fromMemberId = watch("fromMemberId");
  const toMemberId = watch("toMemberId");
  const sharesCount = Number(watch("sharesCount") ?? 0);

  useEffect(() => {
    if (!open) {
      return;
    }

    reset(defaultValues);
  }, [open, reset]);

  const sender = useMemo(
    () => members.find((member) => member.id === fromMemberId) ?? null,
    [fromMemberId, members],
  );
  const recipient = useMemo(
    () => members.find((member) => member.id === toMemberId) ?? null,
    [members, toMemberId],
  );

  const projectedAmount = sharesCount * shareValue;

  const onSubmit = handleSubmit(async (values) => {
    if (sender && sharesCount > sender.totalShares) {
      setError("sharesCount", {
        message: "The sender does not hold enough shares for this transfer.",
      });
      return;
    }

    const response = await fetch("/api/admin/shares/transfers", {
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
          payload?.message ?? "Unable to transfer shares right now.",
      });
      return;
    }

    onOpenChange(false);
    onCompleted(payload?.message ?? "Shares transferred successfully.");
    reset(defaultValues);
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transfer Shares</DialogTitle>
          <DialogDescription>
            Move share units from one member to another. The transfer updates
            both member balances inside one database action.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="share-transfer-sender">From member</Label>
              <select
                id="share-transfer-sender"
                className={SELECT_CLASS_NAME}
                {...register("fromMemberId")}
              >
                <option className="bg-slate-950 text-white" value="">
                  Select sender
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
              <FieldMessage message={errors.fromMemberId?.message?.toString()} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="share-transfer-recipient">To member</Label>
              <select
                id="share-transfer-recipient"
                className={SELECT_CLASS_NAME}
                {...register("toMemberId")}
              >
                <option className="bg-slate-950 text-white" value="">
                  Select recipient
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
              <FieldMessage message={errors.toMemberId?.message?.toString()} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-white/10 bg-slate-950/60 p-4">
              <p className="font-medium text-white">
                {sender?.fullName ?? "Choose a sender"}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                Available shares: {sender?.totalShares ?? 0}
              </p>
            </div>
            <div className="rounded-[24px] border border-emerald-400/15 bg-emerald-500/10 p-4">
              <p className="font-medium text-white">
                {recipient?.fullName ?? "Choose a recipient"}
              </p>
              <p className="mt-1 text-sm text-slate-200">
                Recipient current shares: {recipient?.totalShares ?? 0}
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="share-transfer-count">Share units</Label>
              <Input
                id="share-transfer-count"
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
                Transfer value
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
            <Label htmlFor="share-transfer-reference">Reference</Label>
            <Input
              id="share-transfer-reference"
              placeholder="Optional transfer reference"
              {...register("paymentReference")}
            />
            <FieldMessage message={errors.paymentReference?.message?.toString()} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="share-transfer-notes">Notes</Label>
            <Textarea
              id="share-transfer-notes"
              className="min-h-[120px]"
              placeholder="Optional notes for this transfer"
              {...register("notes")}
            />
            <FieldMessage message={errors.notes?.message?.toString()} />
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
                "Transfer Shares"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
