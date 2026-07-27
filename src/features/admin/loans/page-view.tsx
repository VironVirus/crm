"use client";

import { staticApiFetch } from "@/lib/static-api";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Files,
  GripVertical,
  Landmark,
  Loader2,
  Mail,
  Phone,
  PiggyBank,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LOAN_BOARD_STATUSES,
  formatCompactNaira,
  formatDisplayDate,
  formatGuarantorStatusLabel,
  formatLoanApplicationStatusLabel,
  formatLoanInterestTypeLabel,
  formatNaira,
  getGuarantorStatusTone,
  getLoanStatusTone,
  type AdminLoanApplicationRow,
  type LoanBoardStatus,
} from "@/lib/loans";
import { DisburseLoanDialog } from "@/features/admin/loans/disburse-dialog";
import { RejectLoanDialog } from "@/features/admin/loans/reject-dialog";

const COLUMN_TITLES: Record<LoanBoardStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  disbursed: "Disbursed",
};

function LoanApplicationCard({
  application,
  onOpen,
}: {
  application: AdminLoanApplicationRow;
  onOpen: (applicationId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: application.id,
    data: {
      columnId: application.status,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`w-full rounded-3xl border border-white/10 bg-slate-950/70 p-4 text-left transition hover:border-emerald-400/25 hover:bg-slate-950 ${
        isDragging ? "opacity-70 shadow-2xl shadow-black/50" : ""
      }`}
      onClick={() => onOpen(application.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(application.id);
        }
      }}
      role="button"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      tabIndex={0}
    >
      <div className="flex items-start gap-3">
        <button
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-white">{application.member.fullName}</p>
            <p className="text-xs text-slate-400">
              {application.member.memberNumber ?? "Member number pending"} ·{" "}
              {application.product.name}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                Request
              </p>
              <p className="mt-1 text-sm font-medium text-white">
                {formatCompactNaira(application.amountRequested)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                Tenure
              </p>
              <p className="mt-1 text-sm font-medium text-white">
                {application.tenureMonths} months
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${getLoanStatusTone(
                application.status,
              )}`}
            >
              {formatLoanApplicationStatusLabel(application.status)}
            </span>
            <span className="text-xs text-slate-400">
              {formatDisplayDate(application.appliedAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoanApplicationCardPreview({
  application,
}: {
  application: AdminLoanApplicationRow;
}) {
  return (
    <div className="w-[320px] rounded-3xl border border-emerald-400/20 bg-slate-950/95 p-4 shadow-2xl shadow-black/50">
      <p className="font-medium text-white">{application.member.fullName}</p>
      <p className="mt-1 text-xs text-slate-400">{application.product.name}</p>
      <p className="mt-4 text-lg font-semibold text-white">
        {formatNaira(application.amountRequested)}
      </p>
    </div>
  );
}

function LoanBoardColumn({
  applications,
  columnId,
  onOpen,
}: {
  applications: AdminLoanApplicationRow[];
  columnId: LoanBoardStatus;
  onOpen: (applicationId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: columnId,
    data: {
      columnId,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[420px] flex-col rounded-[32px] border p-4 transition ${
        isOver
          ? "border-emerald-400/30 bg-emerald-500/10"
          : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-['Outfit'] text-lg font-semibold text-white">
            {COLUMN_TITLES[columnId]}
          </p>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
            {applications.length} application
            {applications.length === 1 ? "" : "s"}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${getLoanStatusTone(
            columnId,
          )}`}
        >
          {applications.length}
        </span>
      </div>

      <SortableContext
        items={applications.map((application) => application.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-1 flex-col gap-3">
          {applications.length > 0 ? (
            applications.map((application) => (
              <LoanApplicationCard
                key={application.id}
                application={application}
                onOpen={onOpen}
              />
            ))
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-sm text-slate-400">
              No applications in this column yet.
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export default function AdminLoansPageView({
  applications,
  dataError,
}: {
  applications: AdminLoanApplicationRow[];
  dataError?: string | null;
}) {
  const router = useRouter();
  const [loanApplications, setLoanApplications] = useState(applications);
  const [activeApplicationId, setActiveApplicationId] = useState<string | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [disburseOpen, setDisburseOpen] = useState(false);
  const [draggedApplicationId, setDraggedApplicationId] = useState<string | null>(
    null,
  );
  const [isRefreshing, startTransition] = useTransition();

  useEffect(() => {
    setLoanApplications(applications);
  }, [applications]);

  const activeApplication = useMemo(
    () =>
      loanApplications.find((application) => application.id === activeApplicationId) ??
      null,
    [activeApplicationId, loanApplications],
  );
  const draggedApplication = useMemo(
    () =>
      loanApplications.find(
        (application) => application.id === draggedApplicationId,
      ) ?? null,
    [draggedApplicationId, loanApplications],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const groupedApplications = useMemo(() => {
    const groups = LOAN_BOARD_STATUSES.reduce<
      Record<LoanBoardStatus, AdminLoanApplicationRow[]>
    >(
      (accumulator, status) => {
        accumulator[status] = [];
        return accumulator;
      },
      {
        submitted: [],
        under_review: [],
        approved: [],
        rejected: [],
        disbursed: [],
      },
    );

    loanApplications.forEach((application) => {
      groups[application.status].push(application);
    });

    LOAN_BOARD_STATUSES.forEach((status) => {
      groups[status].sort(
        (left, right) =>
          new Date(right.appliedAt).getTime() - new Date(left.appliedAt).getTime(),
      );
    });

    return groups;
  }, [loanApplications]);

  const summary = useMemo(() => {
    return loanApplications.reduce(
      (totals, application) => {
        totals.pipelineValue += application.amountRequested;

        if (application.status === "submitted") {
          totals.submitted += 1;
        }

        if (application.status === "under_review") {
          totals.underReview += 1;
        }

        if (application.status === "approved") {
          totals.approvedValue += application.amountRequested;
        }

        if (application.status === "disbursed") {
          totals.disbursedValue += application.loan?.amountDisbursed ?? application.amountRequested;
        }

        return totals;
      },
      {
        submitted: 0,
        underReview: 0,
        pipelineValue: 0,
        approvedValue: 0,
        disbursedValue: 0,
      },
    );
  }, [loanApplications]);

  const handleOpenApplication = (applicationId: string) => {
    setActiveApplicationId(applicationId);
    setDrawerOpen(true);
  };

  const refreshBoard = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const patchStatus = async (applicationId: string, status: LoanBoardStatus) => {
    const previousApplications = loanApplications;

    setBoardError(null);
    setFeedbackMessage(null);
    setPendingAction(`${applicationId}:${status}`);
    setLoanApplications((current) =>
      current.map((application) =>
        application.id === applicationId ? { ...application, status } : application,
      ),
    );

    const response = await staticApiFetch(
      `/api/admin/loan-applications/${applicationId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setLoanApplications(previousApplications);
      setBoardError(
        payload?.message ??
          "We could not update the application status right now.",
      );
      setPendingAction(null);
      return;
    }

    setFeedbackMessage(
      payload?.message ?? "Loan application status updated successfully.",
    );
    setPendingAction(null);
    refreshBoard();
  };

  const handleApprove = async () => {
    if (!activeApplication) {
      return;
    }

    setBoardError(null);
    setFeedbackMessage(null);
    setPendingAction(`${activeApplication.id}:approve`);

    const response = await staticApiFetch(
      `/api/admin/loan-applications/${activeApplication.id}/approve`,
      {
        method: "POST",
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setBoardError(
        payload?.message ?? "We could not approve this loan application right now.",
      );
      setPendingAction(null);
      return;
    }

    setFeedbackMessage(
      payload?.message ?? `${activeApplication.member.fullName}'s application was approved.`,
    );
    setPendingAction(null);
    refreshBoard();
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDraggedApplicationId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setDraggedApplicationId(null);

    const activeId = String(event.active.id);
    const active = loanApplications.find((application) => application.id === activeId);

    if (!active || !event.over) {
      return;
    }

    const overColumnId =
      (event.over.data.current?.columnId as LoanBoardStatus | undefined) ??
      loanApplications.find((application) => application.id === String(event.over?.id))
        ?.status;

    if (!overColumnId || overColumnId === active.status) {
      return;
    }

    if (overColumnId === "approved" || overColumnId === "disbursed") {
      setBoardError(
        `Open ${active.member.fullName}'s detail drawer to ${
          overColumnId === "approved" ? "approve" : "disburse"
        } the application.`,
      );
      handleOpenApplication(active.id);
      return;
    }

    if (overColumnId === "rejected") {
      handleOpenApplication(active.id);
      setRejectOpen(true);
      return;
    }

    await patchStatus(active.id, overColumnId);
  };

  return (
    <>
      <div className="space-y-6">
        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader className="space-y-4">
              <Badge className="w-fit">Loan processing dashboard</Badge>
              <CardTitle className="font-['Outfit'] text-3xl text-white">
                Move applications from submission to disbursement
              </CardTitle>
              <CardDescription className="max-w-2xl">
                Drag requests between the working columns, open a member drawer
                for deeper review, and use the approve, reject, and disburse
                actions when the application is ready for a final decision.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-sky-400/15 bg-sky-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-sky-200">
                  Submitted
                </p>
                <p className="mt-2 font-['Outfit'] text-3xl font-semibold text-white">
                  {summary.submitted}
                </p>
              </div>

              <div className="rounded-3xl border border-amber-300/15 bg-amber-400/10 p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-amber-200">
                  Under review
                </p>
                <p className="mt-2 font-['Outfit'] text-3xl font-semibold text-white">
                  {summary.underReview}
                </p>
              </div>

              <div className="rounded-3xl border border-emerald-400/15 bg-emerald-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-emerald-200">
                  Approved value
                </p>
                <p className="mt-2 font-['Outfit'] text-3xl font-semibold text-white">
                  {formatCompactNaira(summary.approvedValue)}
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                  Pipeline value
                </p>
                <p className="mt-2 font-['Outfit'] text-3xl font-semibold text-white">
                  {formatCompactNaira(summary.pipelineValue)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Team notes
              </Badge>
              <CardTitle className="font-['Outfit'] text-2xl text-white">
                How this board behaves
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
                Dragging works best between <span className="text-white">Submitted</span> and{" "}
                <span className="text-white">Under Review</span>.
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
                Use the drawer actions to <span className="text-white">approve</span>,{" "}
                <span className="text-white">reject</span>, or{" "}
                <span className="text-white">disburse</span> so the schedule and
                accounting side stay in sync.
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
                Guarantor statuses are shown inside each member drawer so the
                review team can confirm invitation responses before approval or
                disbursement.
              </div>
            </CardContent>
          </Card>
        </section>

        {dataError ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {dataError}
          </div>
        ) : null}

        {boardError ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {boardError}
          </div>
        ) : null}

        {feedbackMessage ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {feedbackMessage}
          </div>
        ) : null}

        <DndContext
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        >
          <section className="grid gap-4 2xl:grid-cols-5">
            {LOAN_BOARD_STATUSES.map((status) => (
              <LoanBoardColumn
                key={status}
                applications={groupedApplications[status]}
                columnId={status}
                onOpen={handleOpenApplication}
              />
            ))}
          </section>

          <DragOverlay>
            {draggedApplication ? (
              <LoanApplicationCardPreview application={draggedApplication} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <Dialog onOpenChange={setDrawerOpen} open={drawerOpen}>
        <DialogContent className="left-auto right-0 top-0 h-screen w-full max-w-2xl translate-x-0 translate-y-0 overflow-y-auto rounded-none border-l border-white/10 rounded-l-[32px]">
          {activeApplication ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className={getLoanStatusTone(activeApplication.status)}>
                    {formatLoanApplicationStatusLabel(activeApplication.status)}
                  </Badge>
                  <Badge variant="secondary">{activeApplication.product.name}</Badge>
                </div>
                <DialogTitle className="mt-3">
                  {activeApplication.member.fullName}
                </DialogTitle>
                <DialogDescription>
                  {activeApplication.member.memberNumber ?? "Member number pending"} ·{" "}
                  {formatNaira(activeApplication.amountRequested)} over{" "}
                  {activeApplication.tenureMonths} months.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card className="bg-white/[0.04]">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <UserRound className="h-5 w-5 text-emerald-200" />
                        <CardTitle className="text-lg">Member info</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-slate-300">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-slate-400" />
                        {activeApplication.member.email}
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-slate-400" />
                        {activeApplication.member.phone ?? "No phone on file"}
                      </div>
                      <p>{activeApplication.member.address}</p>
                      <p>
                        Occupation:{" "}
                        <span className="font-medium text-white">
                          {activeApplication.member.occupation}
                        </span>
                      </p>
                      <p>
                        Date of birth:{" "}
                        <span className="font-medium text-white">
                          {formatDisplayDate(activeApplication.member.dateOfBirth)}
                        </span>
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-white/[0.04]">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="h-5 w-5 text-amber-200" />
                        <CardTitle className="text-lg">Application details</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-slate-300">
                      <p>
                        Applied:{" "}
                        <span className="font-medium text-white">
                          {formatDisplayDate(activeApplication.appliedAt)}
                        </span>
                      </p>
                      <p>
                        Interest:{" "}
                        <span className="font-medium text-white">
                          {activeApplication.product.interestRate.toFixed(2)}%{" "}
                          {formatLoanInterestTypeLabel(
                            activeApplication.product.interestType,
                          ).toLowerCase()}
                        </span>
                      </p>
                      <p className="leading-6">{activeApplication.purpose}</p>
                      {activeApplication.rejectionReason ? (
                        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-rose-100">
                          {activeApplication.rejectionReason}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-white/[0.04]">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="h-5 w-5 text-emerald-200" />
                      <CardTitle className="text-lg">Profile completion</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Next of kin
                      </p>
                      <p className="mt-2 text-white">
                        {activeApplication.member.nextOfKinName
                          ? `${activeApplication.member.nextOfKinName} · ${
                              activeApplication.member.nextOfKinRelationship ??
                              "Relationship not set"
                            }`
                          : "Not added yet"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {activeApplication.member.nextOfKinPhone ??
                          "No next of kin phone on file"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        KYC status
                      </p>
                      <p className="mt-2 text-white">
                        {activeApplication.member.documents.some(
                          (document) => document.path,
                        )
                          ? "Documents uploaded"
                          : "No KYC uploaded yet"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Member number
                      </p>
                      <p className="mt-2 text-white">
                        {activeApplication.member.memberNumber ?? "Pending"}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/[0.04]">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <PiggyBank className="h-5 w-5 text-emerald-200" />
                      <CardTitle className="text-lg">Savings balance</CardTitle>
                    </div>
                    <CardDescription>
                      Current savings position for loan eligibility review.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-emerald-200">
                        Total
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {formatNaira(activeApplication.member.savingsBalance)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Mandatory
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {formatNaira(activeApplication.member.mandatorySavings)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Voluntary
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {formatNaira(activeApplication.member.voluntarySavings)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Fixed deposit
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {formatNaira(activeApplication.member.fixedDepositSavings)}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                  <Card className="bg-white/[0.04]">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <Wallet className="h-5 w-5 text-sky-200" />
                        <CardTitle className="text-lg">Existing loans</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {activeApplication.existingLoans.length > 0 ? (
                        activeApplication.existingLoans.map((loan) => (
                          <div
                            key={loan.id}
                            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-300"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-white">
                                {formatNaira(loan.principalAmount)}
                              </span>
                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-medium ${getLoanStatusTone(
                                  loan.status,
                                )}`}
                              >
                                {formatLoanApplicationStatusLabel(loan.status)}
                              </span>
                            </div>
                            <p className="mt-2">
                              Outstanding:{" "}
                              <span className="font-medium text-white">
                                {formatNaira(loan.outstandingBalance)}
                              </span>
                            </p>
                            <p className="mt-1">
                              Monthly repayment:{" "}
                              <span className="font-medium text-white">
                                {formatNaira(loan.monthlyRepayment)}
                              </span>
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/30 px-4 py-10 text-center text-sm text-slate-400">
                          No other loans recorded for this member yet.
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-white/[0.04]">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <Files className="h-5 w-5 text-amber-200" />
                        <CardTitle className="text-lg">Guarantors</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {activeApplication.member.guarantors.length > 0 ? (
                        <div className="space-y-3">
                          {activeApplication.member.guarantors.map((guarantor) => (
                            <div
                              key={guarantor.id}
                              className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-300"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="font-medium text-white">
                                    {guarantor.fullName}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-400">
                                    {guarantor.memberNumber ?? "Member number pending"} ·{" "}
                                    {guarantor.email}
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

                              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                                    Liability
                                  </p>
                                  <p className="mt-1 text-sm font-medium text-white">
                                    {formatNaira(guarantor.liabilityAmount)}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                                    Invited
                                  </p>
                                  <p className="mt-1 text-sm font-medium text-white">
                                    {formatDisplayDate(guarantor.invitedAt)}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                                    Latest update
                                  </p>
                                  <p className="mt-1 text-sm font-medium text-white">
                                    {guarantor.releasedAt
                                      ? `Released ${formatDisplayDate(guarantor.releasedAt)}`
                                      : guarantor.respondedAt
                                        ? formatDisplayDate(guarantor.respondedAt)
                                        : "Awaiting response"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/30 px-4 py-10 text-center text-sm text-slate-400">
                          No guarantors have been added to this application yet.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-white/[0.04]">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Files className="h-5 w-5 text-emerald-200" />
                      <CardTitle className="text-lg">Documents and KYC</CardTitle>
                    </div>
                    <CardDescription>
                      Uploaded registration documents for this member.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-3">
                    {activeApplication.member.documents.some((document) => document.path) ? (
                      activeApplication.member.documents.map((document) =>
                        document.path ? (
                          document.signedUrl ? (
                        <a
                          key={document.label}
                          className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-200 transition hover:border-emerald-400/25 hover:bg-slate-950"
                          href={document.signedUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <p className="font-medium text-white">{document.label}</p>
                          <p className="mt-2 break-all text-xs text-slate-400">
                            {document.path}
                          </p>
                          <div className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-emerald-200">
                            Open document
                            <ArrowRight className="h-3.5 w-3.5" />
                          </div>
                        </a>
                          ) : (
                            <div
                              key={document.label}
                              className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-200"
                            >
                              <p className="font-medium text-white">{document.label}</p>
                              <p className="mt-2 break-all text-xs text-slate-400">
                                {document.path}
                              </p>
                              <div className="mt-4 text-xs uppercase tracking-[0.22em] text-slate-500">
                                Signed link unavailable
                              </div>
                            </div>
                          )
                        ) : null,
                      )
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/30 px-4 py-10 text-center text-sm text-slate-400 md:col-span-3">
                        No KYC documents have been uploaded for this member yet.
                      </div>
                    )}
                  </CardContent>
                </Card>

                {activeApplication.loan ? (
                  <Card className="bg-white/[0.04]">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <Landmark className="h-5 w-5 text-violet-200" />
                        <CardTitle className="text-lg">Approved loan record</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                          Monthly repayment
                        </p>
                        <p className="mt-2 text-sm font-medium text-white">
                          {formatNaira(activeApplication.loan.monthlyRepayment)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                          Total repayable
                        </p>
                        <p className="mt-2 text-sm font-medium text-white">
                          {formatNaira(activeApplication.loan.totalRepayable)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                          Outstanding
                        </p>
                        <p className="mt-2 text-sm font-medium text-white">
                          {formatNaira(activeApplication.loan.outstandingBalance)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  {(pendingAction || isRefreshing) && (
                    <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing request
                    </div>
                  )}

                  {(activeApplication.status === "submitted" ||
                    activeApplication.status === "under_review") && (
                    <>
                      <Button
                        className="bg-rose-500 text-white shadow-rose-500/20 hover:bg-rose-400"
                        disabled={Boolean(pendingAction) || isRefreshing}
                        onClick={() => setRejectOpen(true)}
                        type="button"
                      >
                        Reject
                      </Button>
                      <Button
                        disabled={Boolean(pendingAction) || isRefreshing}
                        onClick={handleApprove}
                        type="button"
                      >
                        Approve
                      </Button>
                    </>
                  )}

                  {activeApplication.status === "approved" && (
                    <Button
                      disabled={Boolean(pendingAction) || isRefreshing}
                      onClick={() => setDisburseOpen(true)}
                      type="button"
                    >
                      Disburse
                    </Button>
                  )}

                  {activeApplication.status === "disbursed" && (
                    <div className="flex items-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      This loan has already been disbursed.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <RejectLoanDialog
        application={activeApplication}
        onCompleted={(message) => {
          setFeedbackMessage(message);
          setBoardError(null);
          refreshBoard();
        }}
        onOpenChange={setRejectOpen}
        open={rejectOpen}
      />

      <DisburseLoanDialog
        application={activeApplication}
        onCompleted={(message) => {
          setFeedbackMessage(message);
          setBoardError(null);
          refreshBoard();
        }}
        onOpenChange={setDisburseOpen}
        open={disburseOpen}
      />
    </>
  );
}
