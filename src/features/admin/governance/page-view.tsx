"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { CalendarClock, Loader2, Megaphone, PlusCircle, ShieldAlert } from "lucide-react";
import { z } from "zod";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatMeetingDateTime,
  getMeetingStatusLabel,
  getMeetingStatusTone,
  MEETING_ABSENT_FEE,
  MEETING_LATE_FEE,
  type MeetingStatus,
} from "@/lib/meetings";
import { formatNaira } from "@/lib/loans";

const meetingFormSchema = z
  .object({
    agenda: z.string().trim().max(2000).optional(),
    attendanceClosesAt: z.string().min(1, "Choose when attendance should close."),
    location: z.string().trim().max(160).optional(),
    reminderMessage: z.string().trim().max(500).optional(),
    startsAt: z.string().min(1, "Choose when the meeting starts."),
    title: z.string().trim().min(3, "Enter the meeting title.").max(160),
  })
  .superRefine((value, context) => {
    const startsAt = new Date(value.startsAt);
    const closesAt = new Date(value.attendanceClosesAt);

    if (Number.isNaN(startsAt.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a valid meeting start time.",
        path: ["startsAt"],
      });
    }

    if (Number.isNaN(closesAt.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a valid attendance close time.",
        path: ["attendanceClosesAt"],
      });
    }

    if (
      Number.isFinite(startsAt.getTime()) &&
      Number.isFinite(closesAt.getTime()) &&
      closesAt.getTime() <= startsAt.getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Attendance close time must be after the meeting start time.",
        path: ["attendanceClosesAt"],
      });
    }
  });

type GovernanceMeetingRow = {
  absentCount: number;
  agenda: string | null;
  attendanceClosesAt: string;
  chargeCount: number;
  createdAt: string;
  id: string;
  lateCount: number;
  location: string | null;
  pendingChargesAmount: number;
  presentCount: number;
  reminderMessage: string | null;
  startsAt: string;
  status: MeetingStatus;
  title: string;
};

type MeetingFormValues = z.infer<typeof meetingFormSchema>;

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-700 dark:text-rose-100">{message}</p>;
}

function CreateMeetingDialog({
  onCompleted,
}: {
  onCompleted: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<MeetingFormValues>({
    defaultValues: {
      agenda: "",
      attendanceClosesAt: "",
      location: "",
      reminderMessage: "",
      startsAt: "",
      title: "",
    },
    resolver: zodResolver(meetingFormSchema) as Resolver<MeetingFormValues>,
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);

    const response = await fetch("/api/admin/meetings", {
      body: JSON.stringify({
        agenda: values.agenda || null,
        attendanceClosesAt: new Date(values.attendanceClosesAt).toISOString(),
        location: values.location || null,
        reminderMessage: values.reminderMessage || null,
        startsAt: new Date(values.startsAt).toISOString(),
        title: values.title,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setServerError(payload?.message ?? "Unable to create the meeting.");
      return;
    }

    onCompleted(payload?.message ?? "Meeting created successfully.");
    setOpen(false);
    reset();
    router.refresh();
  });

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          reset();
          setServerError(null);
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          New meeting
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Schedule a meeting</DialogTitle>
          <DialogDescription>
            Members will receive an update as soon as this meeting is created.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="meeting-title">Meeting title</Label>
            <Input
              id="meeting-title"
              placeholder="Monthly cooperative briefing"
              {...register("title")}
            />
            <FieldMessage message={errors.title?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meeting-starts-at">Starts at</Label>
            <Input id="meeting-starts-at" type="datetime-local" {...register("startsAt")} />
            <FieldMessage message={errors.startsAt?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meeting-closes-at">Attendance closes at</Label>
            <Input
              id="meeting-closes-at"
              type="datetime-local"
              {...register("attendanceClosesAt")}
            />
            <FieldMessage message={errors.attendanceClosesAt?.message} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="meeting-location">Location</Label>
            <Input
              id="meeting-location"
              placeholder="Head office or online link"
              {...register("location")}
            />
            <FieldMessage message={errors.location?.message} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="meeting-agenda">Agenda</Label>
            <Textarea
              id="meeting-agenda"
              placeholder="Agenda, talking points, and attendance instructions"
              {...register("agenda")}
            />
            <FieldMessage message={errors.agenda?.message} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="meeting-reminder-message">Reminder note</Label>
            <Textarea
              id="meeting-reminder-message"
              placeholder="Optional note included in the reminder message"
              {...register("reminderMessage")}
            />
            <FieldMessage message={errors.reminderMessage?.message} />
          </div>

          {serverError ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100 md:col-span-2">
              {serverError}
            </div>
          ) : null}

          <div className="flex justify-end md:col-span-2">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                "Schedule meeting"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MeetingActionButton({
  action,
  label,
  meetingId,
  onCompleted,
  variant = "secondary",
}: {
  action: "cancel" | "close";
  label: string;
  meetingId: string;
  onCompleted: (message: string) => void;
  variant?: "default" | "secondary";
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAction() {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/meetings/${meetingId}`, {
        body: JSON.stringify({ action }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to update this meeting.");
      }

      onCompleted(payload?.message ?? "Meeting updated successfully.");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update this meeting.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        disabled={isSubmitting}
        onClick={() => void handleAction()}
        type="button"
        variant={variant}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          label
        )}
      </Button>
      {errorMessage ? (
        <p className="text-xs text-rose-700 dark:text-rose-100">{errorMessage}</p>
      ) : null}
    </div>
  );
}

export default function AdminGovernancePageView({
  dataError,
  rows,
  totals,
}: {
  dataError?: string | null;
  rows: GovernanceMeetingRow[];
  totals: {
    closed: number;
    pendingChargesAmount: number;
    pendingChargesCount: number;
    scheduled: number;
  };
}) {
  const router = useRouter();
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isSendingReminders, setIsSendingReminders] = useState(false);

  async function handleSendReminders() {
    setIsSendingReminders(true);

    try {
      const response = await fetch("/api/admin/meetings/reminders", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to send reminders right now.");
      }

      setFeedbackMessage(
        payload?.message ?? "Meeting reminders sent successfully.",
      );
      router.refresh();
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error
          ? error.message
          : "Unable to send reminders right now.",
      );
    } finally {
      setIsSendingReminders(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-border bg-card p-5 shadow-2xl shadow-black/10 dark:shadow-black/30 sm:rounded-[32px] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge className="w-fit">Governance</Badge>
            <h2 className="max-w-3xl font-['Outfit'] text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
              Meetings, attendance, and attendance charges
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Late arrivals attract {formatNaira(MEETING_LATE_FEE)} while absences attract{" "}
              {formatNaira(MEETING_ABSENT_FEE)}.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              disabled={isSendingReminders}
              onClick={() => void handleSendReminders()}
              type="button"
              variant="secondary"
            >
              {isSendingReminders ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Megaphone className="mr-2 h-4 w-4" />
                  Send reminders now
                </>
              )}
            </Button>
            <CreateMeetingDialog onCompleted={setFeedbackMessage} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Scheduled meetings</CardDescription>
            <CardTitle className="font-['Outfit'] text-3xl text-foreground">
              {totals.scheduled}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Closed meetings</CardDescription>
            <CardTitle className="font-['Outfit'] text-3xl text-foreground">
              {totals.closed}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Attendance charges</CardDescription>
            <CardTitle className="font-['Outfit'] text-3xl text-foreground">
              {totals.pendingChargesCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-rose-400/20 bg-rose-500/10">
          <CardHeader>
            <CardDescription>Pending charge value</CardDescription>
            <CardTitle className="font-['Outfit'] text-3xl text-foreground">
              {formatNaira(totals.pendingChargesAmount)}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      {feedbackMessage ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
          {feedbackMessage}
        </div>
      ) : null}

      {dataError ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">
          {dataError}
        </div>
      ) : null}

      <section className="grid gap-4">
        {rows.length > 0 ? (
          rows.map((meeting) => (
            <Card key={meeting.id}>
              <CardHeader className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="font-['Outfit'] text-2xl text-foreground">
                        {meeting.title}
                      </CardTitle>
                      <Badge
                        className={getMeetingStatusTone(meeting.status)}
                        variant="outline"
                      >
                        {getMeetingStatusLabel(meeting.status)}
                      </Badge>
                    </div>
                    <CardDescription className="text-sm leading-6">
                      {meeting.agenda || "No agenda note added for this meeting yet."}
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {meeting.status === "scheduled" ? (
                      <>
                        <MeetingActionButton
                          action="close"
                          label="Close attendance"
                          meetingId={meeting.id}
                          onCompleted={setFeedbackMessage}
                        />
                        <MeetingActionButton
                          action="cancel"
                          label="Cancel meeting"
                          meetingId={meeting.id}
                          onCompleted={setFeedbackMessage}
                          variant="secondary"
                        />
                      </>
                    ) : null}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Starts
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {formatMeetingDateTime(meeting.startsAt)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Attendance closes
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {formatMeetingDateTime(meeting.attendanceClosesAt)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Location
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {meeting.location || "Not set"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Pending charges
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {formatNaira(meeting.pendingChargesAmount)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-100">
                      Present
                    </p>
                    <p className="mt-2 font-['Outfit'] text-2xl font-semibold text-foreground">
                      {meeting.presentCount}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-amber-800 dark:text-amber-100">
                      Late
                    </p>
                    <p className="mt-2 font-['Outfit'] text-2xl font-semibold text-foreground">
                      {meeting.lateCount}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-rose-700 dark:text-rose-100">
                      Absent
                    </p>
                    <p className="mt-2 font-['Outfit'] text-2xl font-semibold text-foreground">
                      {meeting.absentCount}
                    </p>
                  </div>
                </div>

                {meeting.reminderMessage ? (
                  <div className="rounded-2xl border border-border bg-secondary px-4 py-4 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Reminder note:</span>{" "}
                    {meeting.reminderMessage}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="font-['Outfit'] text-2xl text-foreground">
                No meetings scheduled yet
              </CardTitle>
              <CardDescription>
                Create the first meeting to start member attendance tracking.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>
    </div>
  );
}
