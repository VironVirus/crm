"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Search, Wallet } from "lucide-react";
import { type SubmitHandler, useForm } from "react-hook-form";
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
import {
  formatAccountTypeLabel,
  formatNaira,
  sortSavingsAccountsByType,
  type SavingsAccountType,
  type SavingsMemberOption,
} from "@/lib/savings";
import { savingsTransactionSchema } from "@/lib/validation/savings";

type SavingsTransactionFormValues = z.input<typeof savingsTransactionSchema>;

const SELECT_CLASS_NAME =
  "flex h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50";

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-200">{message}</p>;
}

function createDefaultValues(
  mode: "deposit" | "withdrawal",
): SavingsTransactionFormValues {
  return {
    memberId: "",
    accountType: "mandatory",
    transactionType: mode,
    amount: undefined,
    paymentReference: "",
    narration: "",
  };
}

export function SavingsTransactionDialog({
  mode,
  members,
  onCompleted,
  onOpenChange,
  open,
}: {
  mode: "deposit" | "withdrawal";
  members: SavingsMemberOption[];
  onCompleted: (message: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [memberQuery, setMemberQuery] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<SavingsTransactionFormValues>({
    resolver: zodResolver(savingsTransactionSchema),
    defaultValues: createDefaultValues(mode),
  });

  const selectedMemberId = watch("memberId");
  const selectedAccountType = watch("accountType") as SavingsAccountType;
  const amountValue = Number(watch("amount") ?? 0);

  useEffect(() => {
    if (!open) {
      return;
    }

    reset(createDefaultValues(mode));
    setMemberQuery("");
    setServerError(null);
  }, [mode, open, reset]);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const selectedAccount = useMemo(() => {
    if (!selectedMember) {
      return null;
    }

    return (
      sortSavingsAccountsByType(selectedMember.accounts).find(
        (account) =>
          account.accountType === selectedAccountType && account.status === "active",
      ) ?? null
    );
  }, [selectedAccountType, selectedMember]);

  const filteredMembers = useMemo(() => {
    const normalizedQuery = memberQuery.trim().toLowerCase();
    const pool = members.filter((member) => {
      if (!normalizedQuery) {
        return true;
      }

      return (
        member.fullName.toLowerCase().includes(normalizedQuery) ||
        member.email.toLowerCase().includes(normalizedQuery) ||
        member.memberNumber?.toLowerCase().includes(normalizedQuery)
      );
    });

    return pool.slice(0, 8);
  }, [memberQuery, members]);

  const projectedBalance =
    mode === "withdrawal"
      ? Math.max((selectedAccount?.balance ?? 0) - amountValue, 0)
      : (selectedAccount?.balance ?? 0) + amountValue;

  const handleSelectMember = (member: SavingsMemberOption) => {
    setValue("memberId", member.id, { shouldValidate: true });
    setMemberQuery(
      member.memberNumber
        ? `${member.fullName} · ${member.memberNumber}`
        : member.fullName,
    );
    setServerError(null);

    if (member.accounts.length > 0) {
      setValue("accountType", member.accounts[0].accountType, {
        shouldValidate: true,
      });
    }
  };

  const onSubmit: SubmitHandler<SavingsTransactionFormValues> = async (values) => {
    setServerError(null);

    if (mode === "withdrawal") {
      if (!selectedAccount) {
        setError("accountType", {
          message: "This member does not have an active account of that type.",
        });
        return;
      }

      if (amountValue > selectedAccount.balance) {
        setError("amount", {
          message: "Withdrawal amount cannot exceed the current balance.",
        });
        return;
      }
    }

    const response = await fetch("/api/admin/savings/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...values,
        amount: Number(values.amount),
        transactionType: mode,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setServerError(
        payload?.message ??
          `Unable to record the ${mode}. Please try again.`,
      );
      return;
    }

    onOpenChange(false);
    onCompleted(
      payload?.message ??
        `Savings ${mode === "deposit" ? "deposit" : "withdrawal"} recorded successfully.`,
    );
    reset(createDefaultValues(mode));
    setMemberQuery("");
  };

  const memberHasMatchingAccount = Boolean(selectedAccount);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "deposit" ? "Record Deposit" : "Record Withdrawal"}
          </DialogTitle>
          <DialogDescription>
            {mode === "deposit"
              ? "Search for a member, choose the savings type, and post a new savings deposit."
              : "Search for a member, choose the savings type, and record a withdrawal without exceeding the available balance."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-member-search`}>Find member</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id={`${mode}-member-search`}
                className="pl-11"
                onChange={(event) => {
                  setMemberQuery(event.target.value);
                  setValue("memberId", "", { shouldValidate: true });
                }}
                placeholder="Search by full name, member number, or email"
                value={memberQuery}
              />
            </div>
            <FieldMessage message={errors.memberId?.message?.toString()} />

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-2">
              {filteredMembers.length > 0 ? (
                filteredMembers.map((member) => (
                  <button
                    key={member.id}
                    className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-white/5"
                    onClick={(event) => {
                      event.preventDefault();
                      handleSelectMember(member);
                    }}
                    type="button"
                  >
                    <div>
                      <p className="font-medium text-white">{member.fullName}</p>
                      <p className="text-xs text-slate-400">
                        {member.memberNumber ?? "Member number pending"} · {member.email}
                      </p>
                    </div>
                    <span className="text-xs uppercase tracking-[0.22em] text-emerald-200">
                      Select
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-5 text-sm text-slate-400">
                  No members match that search yet.
                </div>
              )}
            </div>
          </div>

          {selectedMember ? (
            <div className="rounded-[24px] border border-emerald-400/15 bg-emerald-500/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{selectedMember.fullName}</p>
                  <p className="text-sm text-slate-300">
                    {selectedMember.memberNumber ?? "Member number pending"}
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-emerald-200">
                  {selectedMember.accounts.length} account
                  {selectedMember.accounts.length === 1 ? "" : "s"}
                </div>
              </div>

              {selectedMember.accounts.length > 0 ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {sortSavingsAccountsByType(selectedMember.accounts).map((account) => (
                    <div
                      key={account.id}
                      className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3"
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        {formatAccountTypeLabel(account.accountType)}
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {formatNaira(account.balance)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-300">
                  This member does not have any savings accounts yet.
                </p>
              )}
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${mode}-account-type`}>Savings type</Label>
              <select
                id={`${mode}-account-type`}
                className={SELECT_CLASS_NAME}
                {...register("accountType")}
              >
                <option className="bg-slate-950 text-white" value="mandatory">
                  Mandatory
                </option>
                <option className="bg-slate-950 text-white" value="voluntary">
                  Voluntary
                </option>
                <option className="bg-slate-950 text-white" value="fixed_deposit">
                  Fixed Deposit
                </option>
              </select>
              <FieldMessage message={errors.accountType?.message?.toString()} />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${mode}-amount`}>Amount</Label>
              <Input
                id={`${mode}-amount`}
                min="0"
                placeholder="0.00"
                step="0.01"
                type="number"
                {...register("amount")}
              />
              <FieldMessage message={errors.amount?.message?.toString()} />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${mode}-payment-reference`}>Payment reference</Label>
              <Input
                id={`${mode}-payment-reference`}
                placeholder="Receipt number, transfer ID, teller ID"
                {...register("paymentReference")}
              />
              <FieldMessage message={errors.paymentReference?.message?.toString()} />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${mode}-balance-preview`}>Balance preview</Label>
              <div className="flex h-11 items-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white">
                <Wallet className="mr-3 h-4 w-4 text-emerald-200" />
                {selectedMember ? formatNaira(projectedBalance) : "Select a member first"}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${mode}-narration`}>Narration</Label>
            <Textarea
              id={`${mode}-narration`}
              className="min-h-[110px]"
              placeholder="Add a short note about this transaction"
              {...register("narration")}
            />
            <FieldMessage message={errors.narration?.message?.toString()} />
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/40 px-4 py-4 text-sm text-slate-300">
            {mode === "deposit" ? (
              memberHasMatchingAccount ? (
                <p>
                  This deposit will be posted into the member&apos;s{" "}
                  {formatAccountTypeLabel(selectedAccountType).toLowerCase()} account.
                </p>
              ) : (
                <p>
                  No active {formatAccountTypeLabel(selectedAccountType).toLowerCase()} account exists
                  yet. Saving this deposit will open one automatically.
                </p>
              )
            ) : memberHasMatchingAccount ? (
              <p>
                Available balance for this account:{" "}
                <span className="font-medium text-white">
                  {formatNaira(selectedAccount?.balance ?? 0)}
                </span>
              </p>
            ) : (
              <p>
                A withdrawal can only be posted to an existing active{" "}
                {formatAccountTypeLabel(selectedAccountType).toLowerCase()} account.
              </p>
            )}
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
              disabled={
                isSubmitting ||
                !selectedMember ||
                (mode === "withdrawal" && !memberHasMatchingAccount)
              }
              type="submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : mode === "deposit" ? (
                "Post deposit"
              ) : (
                "Post withdrawal"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
