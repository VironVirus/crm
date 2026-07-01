"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  formatDisplayDate,
  formatNaira,
  type PendingGuarantorRequest,
} from "@/lib/loans";

export function PendingGuarantorRequestsPanel({
  requests,
}: {
  requests: PendingGuarantorRequest[];
}) {
  const router = useRouter();
  const [pendingRequests, setPendingRequests] = useState(requests);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [isRefreshing, startTransition] = useTransition();

  useEffect(() => {
    setPendingRequests(requests);
  }, [requests]);

  const handleRespond = async (
    guarantorRequestId: string,
    decision: "accepted" | "declined",
  ) => {
    setPendingRequestId(guarantorRequestId);
    setFeedbackMessage(null);
    setErrorMessage(null);

    const response = await fetch(
      `/api/guarantor-requests/${guarantorRequestId}/respond`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision }),
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setErrorMessage(
        payload?.message ??
          "We could not save your guarantor response right now.",
      );
      setPendingRequestId(null);
      return;
    }

    setPendingRequests((current) =>
      current.filter((request) => request.id !== guarantorRequestId),
    );
    setFeedbackMessage(
      payload?.message ??
        `Guarantor request ${decision === "accepted" ? "accepted" : "declined"} successfully.`,
    );
    setPendingRequestId(null);

    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {errorMessage ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {feedbackMessage ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
          {feedbackMessage}
        </div>
      ) : null}

      {pendingRequests.length > 0 ? (
        pendingRequests.map((request) => {
          const isPending = pendingRequestId === request.id || isRefreshing;

          return (
            <div
              key={request.id}
              className="rounded-3xl border border-border bg-card p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-foreground">{request.applicantName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {request.applicantMemberNumber ?? "Member number pending"} ·{" "}
                    {request.loanProductName}
                  </p>
                </div>
                <div className="rounded-full border border-border bg-secondary px-3 py-1 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  Invited {formatDisplayDate(request.invitedAt)}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-secondary px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    Loan amount
                  </p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {formatNaira(request.amountRequested)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-secondary px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    Tenure
                  </p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {request.tenureMonths} months
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-emerald-200">
                    Liability share
                  </p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {formatNaira(request.liabilityAmount)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  className="bg-rose-500 text-white shadow-rose-500/20 hover:bg-rose-400"
                  disabled={isPending}
                  onClick={() => handleRespond(request.id, "declined")}
                  type="button"
                >
                  {isPending && pendingRequestId === request.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving
                    </>
                  ) : (
                    "Decline"
                  )}
                </Button>
                <Button
                  disabled={isPending}
                  onClick={() => handleRespond(request.id, "accepted")}
                  type="button"
                >
                  {isPending && pendingRequestId === request.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving
                    </>
                  ) : (
                    "Accept"
                  )}
                </Button>
              </div>
            </div>
          );
        })
      ) : (
        <div className="rounded-3xl border border-dashed border-border bg-secondary px-4 py-10 text-center text-sm text-muted-foreground">
          No pending guarantor requests right now.
        </div>
      )}
    </div>
  );
}
