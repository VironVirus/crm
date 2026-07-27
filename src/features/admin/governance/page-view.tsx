"use client";

import { staticApiFetch } from "@/lib/static-api";

import { useMemo, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import {
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Megaphone,
  Pencil,
  PlusCircle,
  ShieldAlert,
} from "lucide-react";
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
  groupMeetingsByDate,
  formatMeetingDateTime,
  getAttendanceStatusLabel,
  getAttendanceStatusTone,
  getMeetingStatusLabel,
  getMeetingStatusTone,
  MEETING_ABSENT_FEE,
  MEETING_LATE_FEE,
  type MeetingStatus,
} from "@/lib/meetings";
import { formatNaira } from "@/lib/loans";

const meetingFormSchema = z
  .object({
    absenceFee: z.coerce.number().finite().min(0, "Enter a valid absence fee."),
    agenda: z.string().trim().max(2000).optional(),
    attendanceClosesAt: z.string().min(1, "Choose when attendance should close."),
    latenessStartsAt: z.string().min(1, "Choose when lateness should begin."),
    location: z.string().trim().max(160).optional(),
    lateFee: z.coerce.number().finite().min(0, "Enter a valid late fee."),
    reminderMessage: z.string().trim().max(500).optional(),
    startsAt: z.string().min(1, "Choose when the meeting starts."),
    title: z.string().trim().min(3, "Enter the meeting title.").max(160),
  })
  .superRefine((value, context) => {
    const startsAt = new Date(value.startsAt);
    const latenessStartsAt = new Date(value.latenessStartsAt);
    const closesAt = new Date(value.attendanceClosesAt);

    if (Number.isNaN(startsAt.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a valid meeting start time.",
        path: ["startsAt"],
      });
    }

    if (Number.isNaN(latenessStartsAt.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a valid lateness start time.",
        path: ["latenessStartsAt"],
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
      Number.isFinite(latenessStartsAt.getTime()) &&
      latenessStartsAt.getTime() < startsAt.getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Lateness cannot begin before the meeting starts.",
        path: ["latenessStartsAt"],
      });
    }

    if (
      Number.isFinite(latenessStartsAt.getTime()) &&
      Number.isFinite(closesAt.getTime()) &&
      closesAt.getTime() <= latenessStartsAt.getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Attendance close time must be after the lateness start time.",
        path: ["attendanceClosesAt"],
      });
    }
  });

type GovernanceAttendanceRow = {
  approvedAt: string | null;
  chargeAmount: number;
  id: string;
  isApproved: boolean;
  markedAt: string | null;
  memberId: string;
  memberName: string;
  memberNumber: string | null;
  notes: string | null;
  status: "absent" | "late" | "present";
};

type GovernanceMeetingRow = {
  absentCount: number;
  absenceFee: number;
  agenda: string | null;
  attendanceClosesAt: string;
  attendees: GovernanceAttendanceRow[];
  chargeCount: number;
  createdAt: string;
  id: string;
  lateCount: number;
  latenessStartsAt: string;
  lateFee: number;
  location: string | null;
  pendingApprovalCount: number;
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

function FieldHint({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-5 text-muted-foreground">{children}</p>;
}

function formatDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTimePreview(value: string | null | undefined) {
  if (!value) {
    return "Choose a time";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Choose a time";
  }

  return formatMeetingDateTime(date.toISOString());
}

function MeetingFormDialog({
  meeting,
  onCompleted,
}: {
  meeting?: GovernanceMeetingRow | null;
  onCompleted: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const defaultValues = useMemo<MeetingFormValues>(
    () => ({
      absenceFee: meeting?.absenceFee ?? MEETING_ABSENT_FEE,
      agenda: meeting?.agenda ?? "",
      attendanceClosesAt: formatDateTimeLocalValue(meeting?.attendanceClosesAt),
      latenessStartsAt: formatDateTimeLocalValue(meeting?.latenessStartsAt),
      location: meeting?.location ?? "",
      lateFee: meeting?.lateFee ?? MEETING_LATE_FEE,
      reminderMessage: meeting?.reminderMessage ?? "",
      startsAt: formatDateTimeLocalValue(meeting?.startsAt),
      title: meeting?.title ?? "",
    }),
    [meeting],
  );
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    watch,
  } = useForm<MeetingFormValues>({
    defaultValues,
    resolver: zodResolver(meetingFormSchema) as Resolver<MeetingFormValues>,
  });
  const startsAt = watch("startsAt");
  const latenessStartsAt = watch("latenessStartsAt");
  const attendanceClosesAt = watch("attendanceClosesAt");

  const submit = handleSubmit(async (values) => {
    setServerError(null);

    const response = await staticApiFetch(
      meeting ? `/api/admin/meetings/${meeting.id}` : "/api/admin/meetings",
      {
        body: JSON.stringify({
          agenda: values.agenda || null,
          absenceFee: values.absenceFee,
          attendanceClosesAt: new Date(values.attendanceClosesAt).toISOString(),
          latenessStartsAt: new Date(values.latenessStartsAt).toISOString(),
          location: values.location || null,
          lateFee: values.lateFee,
          reminderMessage: values.reminderMessage || null,
          startsAt: new Date(values.startsAt).toISOString(),
          title: values.title,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: meeting ? "PATCH" : "POST",
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setServerError(payload?.message ?? "Unable to save the meeting.");
      return;
    }

    onCompleted(
      payload?.message ??
        (meeting ? "Meeting updated successfully." : "Meeting created successfully."),
    );
    setOpen(false);
    reset(defaultValues);
    router.refresh();
  });

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          reset(defaultValues);
          setServerError(null);
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={meeting ? "secondary" : "default"}>
          {meeting ? (
            <>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </>
          ) : (
            <>
              <PlusCircle className="mr-2 h-4 w-4" />
              New meeting
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {meeting ? "Edit meeting" : "Schedule a meeting"}
          </DialogTitle>
          <DialogDescription>
            {meeting
              ? "Update the time, venue, and lateness cutoff. Existing attendance will be recalculated automatically."
              : "Members will receive a meeting update as soon as you save this schedule."}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <div className="rounded-3xl border border-emerald-400/15 bg-emerald-500/10 p-4 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-100">
              Schedule summary
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-emerald-400/20 bg-background/70 px-4 py-3 text-sm text-foreground">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  Meeting starts
                </p>
                <p className="mt-2">
                  {formatDateTimePreview(startsAt)}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-background/70 px-4 py-3 text-sm text-foreground">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  Late from
                </p>
                <p className="mt-2">
                  {formatDateTimePreview(latenessStartsAt)}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-background/70 px-4 py-3 text-sm text-foreground">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  Attendance closes
                </p>
                <p className="mt-2">
                  {formatDateTimePreview(attendanceClosesAt)}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="meeting-title">Meeting title</Label>
            <Input
              id="meeting-title"
              placeholder="Monthly cooperative briefing"
              {...register("title")}
            />
            <FieldHint>Use a short title members will recognize immediately from reminders and notifications.</FieldHint>
            <FieldMessage message={errors.title?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meeting-starts-at">Starts at</Label>
            <Input id="meeting-starts-at" type="datetime-local" {...register("startsAt")} />
            <FieldHint>This is the official meeting start time shown to members.</FieldHint>
            <FieldMessage message={errors.startsAt?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meeting-lateness-starts-at">Lateness starts at</Label>
            <Input
              id="meeting-lateness-starts-at"
              type="datetime-local"
              {...register("latenessStartsAt")}
            />
            <FieldHint>Attendance marked after this time becomes late and attracts the configured late penalty.</FieldHint>
            <FieldMessage message={errors.latenessStartsAt?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meeting-closes-at">Attendance closes at</Label>
            <Input
              id="meeting-closes-at"
              type="datetime-local"
              {...register("attendanceClosesAt")}
            />
            <FieldHint>When you end the meeting or this time passes, anyone not marked becomes absent and attracts the configured absence penalty.</FieldHint>
            <FieldMessage message={errors.attendanceClosesAt?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meeting-location">Venue</Label>
            <Input
              id="meeting-location"
              placeholder="Head office or online link"
              {...register("location")}
            />
            <FieldHint>Add the physical venue or meeting link members should use.</FieldHint>
            <FieldMessage message={errors.location?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meeting-late-fee">Late attendance penalty</Label>
            <Input
              id="meeting-late-fee"
              min="0"
              step="0.01"
              type="number"
              {...register("lateFee")}
            />
            <FieldHint>Members marked after the lateness cutoff receive this charge.</FieldHint>
            <FieldMessage message={errors.lateFee?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meeting-absence-fee">Absence penalty</Label>
            <Input
              id="meeting-absence-fee"
              min="0"
              step="0.01"
              type="number"
              {...register("absenceFee")}
            />
            <FieldHint>Members not marked before attendance closes receive this charge.</FieldHint>
            <FieldMessage message={errors.absenceFee?.message} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="meeting-agenda">Agenda</Label>
            <Textarea
              id="meeting-agenda"
              placeholder="Agenda, talking points, and attendance instructions"
              {...register("agenda")}
            />
            <FieldHint>Keep this short and practical so members know what the meeting is about.</FieldHint>
            <FieldMessage message={errors.agenda?.message} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="meeting-reminder-message">Reminder note</Label>
            <Textarea
              id="meeting-reminder-message"
              placeholder="Optional note included in reminders"
              {...register("reminderMessage")}
            />
            <FieldHint>Use this for dress code, documents to bring, or any final note members should not miss.</FieldHint>
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
                  Saving...
                </>
              ) : meeting ? (
                "Save meeting changes"
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
      const response = await staticApiFetch(`/api/admin/meetings/${meetingId}`, {
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
        size="sm"
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

function AttendanceApprovalButton({
  attendanceId,
  meetingId,
  onCompleted,
}: {
  attendanceId: string;
  meetingId: string;
  onCompleted: (message: string) => void;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleApprove() {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await staticApiFetch(
        `/api/admin/meetings/${meetingId}/attendance/${attendanceId}`,
        {
          body: JSON.stringify({ isApproved: true }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "PATCH",
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          payload?.message ?? "Unable to approve this attendance entry.",
        );
      }

      onCompleted(payload?.message ?? "Attendance approved successfully.");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to approve this attendance entry.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        disabled={isSubmitting}
        onClick={() => void handleApprove()}
        size="sm"
        type="button"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Approving...
          </>
        ) : (
          <>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Approve
          </>
        )}
      </Button>
      {errorMessage ? (
        <p className="text-xs text-rose-700 dark:text-rose-100">{errorMessage}</p>
      ) : null}
    </div>
  );
}

function MeetingCard({
  meeting,
  onCompleted,
}: {
  meeting: GovernanceMeetingRow;
  onCompleted: (message: string) => void;
}) {
  return (
    <Card className="rounded-[22px]">
      <CardHeader className="space-y-3 p-4 pb-3 sm:p-5 sm:pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="font-['Outfit'] text-lg text-foreground sm:text-xl">
                {meeting.title}
              </CardTitle>
              <Badge
                className={getMeetingStatusTone(meeting.status)}
                variant="outline"
              >
                {getMeetingStatusLabel(meeting.status)}
              </Badge>
            </div>
            <CardDescription className="text-xs leading-5 sm:text-sm">
              {meeting.agenda || "No agenda note added for this meeting yet."}
            </CardDescription>
          </div>

          {meeting.status === "scheduled" ? (
            <div className="flex flex-wrap gap-2">
              <MeetingFormDialog meeting={meeting} onCompleted={onCompleted} />
              <MeetingActionButton
                action="close"
                label="End meeting"
                meetingId={meeting.id}
                onCompleted={onCompleted}
                variant="default"
              />
              <MeetingActionButton
                action="cancel"
                label="Cancel"
                meetingId={meeting.id}
                onCompleted={onCompleted}
                variant="secondary"
              />
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-border bg-secondary px-3 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Starts
            </p>
            <p className="mt-1.5 text-xs font-medium text-foreground sm:text-sm">
              {formatMeetingDateTime(meeting.startsAt)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-secondary px-3 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Late from
            </p>
            <p className="mt-1.5 text-xs font-medium text-foreground sm:text-sm">
              {formatMeetingDateTime(meeting.latenessStartsAt)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-secondary px-3 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Attendance closes
            </p>
            <p className="mt-1.5 text-xs font-medium text-foreground sm:text-sm">
              {formatMeetingDateTime(meeting.attendanceClosesAt)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-secondary px-3 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Venue
            </p>
            <p className="mt-1.5 text-xs font-medium text-foreground sm:text-sm">
              {meeting.location || "Not set"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-secondary px-3 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Pending charges
            </p>
            <p className="mt-1.5 text-xs font-medium text-foreground sm:text-sm">
              {formatNaira(meeting.pendingChargesAmount)}
            </p>
          </div>
        </div>

        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-100">
              Present
            </p>
            <p className="mt-1.5 font-['Outfit'] text-xl font-semibold text-foreground">
              {meeting.presentCount}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-amber-800 dark:text-amber-100">
              Late
            </p>
            <p className="mt-1.5 font-['Outfit'] text-xl font-semibold text-foreground">
              {meeting.lateCount}
            </p>
          </div>
          <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-3 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-rose-700 dark:text-rose-100">
              Absent
            </p>
            <p className="mt-1.5 font-['Outfit'] text-xl font-semibold text-foreground">
              {meeting.absentCount}
            </p>
          </div>
          <div className="rounded-2xl border border-sky-300/20 bg-sky-500/10 px-3 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-sky-700 dark:text-sky-100">
              Awaiting approval
            </p>
            <p className="mt-1.5 font-['Outfit'] text-xl font-semibold text-foreground">
              {meeting.pendingApprovalCount}
            </p>
          </div>
        </div>

        {meeting.reminderMessage ? (
          <div className="rounded-2xl border border-border bg-secondary px-3 py-3 text-xs text-muted-foreground sm:text-sm">
            <span className="font-medium text-foreground">Reminder note:</span>{" "}
            {meeting.reminderMessage}
          </div>
        ) : null}

        <div className="rounded-3xl border border-border bg-secondary/70 p-3.5 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-['Outfit'] text-lg font-semibold text-foreground sm:text-xl">
                Meeting report
              </p>
              <p className="text-xs text-muted-foreground sm:text-sm">
                {meeting.attendees.length > 0
                  ? `${meeting.attendees.length} attendance record${meeting.attendees.length === 1 ? "" : "s"} captured for this meeting.`
                  : "Attendance records will appear here as members mark attendance."}
              </p>
            </div>
            <Badge className="w-fit" variant="secondary">
              {meeting.pendingApprovalCount} pending approval
            </Badge>
          </div>

          {meeting.attendees.length > 0 ? (
            <div className="mt-3 grid gap-2.5">
              {meeting.attendees.map((attendance) => (
                <div
                  key={attendance.id}
                  className="rounded-2xl border border-border bg-card px-3 py-3"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {attendance.memberName}
                        </p>
                        {attendance.memberNumber ? (
                          <Badge variant="secondary">{attendance.memberNumber}</Badge>
                        ) : null}
                        <Badge
                          className={getAttendanceStatusTone(attendance.status)}
                          variant="outline"
                        >
                          {getAttendanceStatusLabel(attendance.status)}
                        </Badge>
                        <Badge
                          className={
                            attendance.isApproved
                              ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100"
                              : "border-amber-300/30 bg-amber-400/10 text-amber-800 dark:text-amber-100"
                          }
                          variant="outline"
                        >
                          {attendance.isApproved ? "Approved" : "Pending approval"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        {attendance.markedAt
                          ? `Marked on ${formatMeetingDateTime(attendance.markedAt)}.`
                          : "Auto-marked absent when the meeting ended."}{" "}
                        {attendance.chargeAmount > 0
                          ? `Charge: ${formatNaira(attendance.chargeAmount)}.`
                          : "No charge applied."}
                      </p>
                      {attendance.approvedAt ? (
                        <p className="text-xs text-muted-foreground">
                          Approved on {formatMeetingDateTime(attendance.approvedAt)}.
                        </p>
                      ) : null}
                      {attendance.notes ? (
                        <p className="text-xs text-muted-foreground">
                          Notes: {attendance.notes}
                        </p>
                      ) : null}
                    </div>

                    {!attendance.isApproved ? (
                      <AttendanceApprovalButton
                        attendanceId={attendance.id}
                        meetingId={meeting.id}
                        onCompleted={onCompleted}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function MeetingDateGroup({
  meetings,
  onCompleted,
  title,
}: {
  meetings: GovernanceMeetingRow[];
  onCompleted: (message: string) => void;
  title: string;
}) {
  if (meetings.length === 0) {
    return null;
  }

  const groupedMeetings = groupMeetingsByDate(meetings);

  return (
    <div className="space-y-3">
      {groupedMeetings.map((group, index) => (
        <details
          className="group overflow-hidden rounded-[22px] border border-border bg-card shadow-lg shadow-black/5 dark:shadow-black/20"
          key={`${title}-${group.dateKey}`}
          open={index === 0}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 marker:hidden sm:px-5">
            <div className="space-y-1">
              <p className="font-['Outfit'] text-lg font-semibold text-foreground">
                {group.label}
              </p>
              <p className="text-xs text-muted-foreground sm:text-sm">
                {group.meetings.length} meeting
                {group.meetings.length === 1 ? "" : "s"} on this date
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{group.meetings.length}</Badge>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
            </div>
          </summary>

          <div className="border-t border-border px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
            <div className="space-y-3">
              {group.meetings.map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  onCompleted={onCompleted}
                />
              ))}
            </div>
          </div>
        </details>
      ))}
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
    pendingApprovals: number;
    pendingChargesAmount: number;
    pendingChargesCount: number;
    scheduled: number;
  };
}) {
  const router = useRouter();
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const scheduledRows = useMemo(
    () => rows.filter((meeting) => meeting.status === "scheduled"),
    [rows],
  );
  const historyRows = useMemo(
    () => rows.filter((meeting) => meeting.status !== "scheduled"),
    [rows],
  );

  async function handleSendReminders() {
    setIsSendingReminders(true);

    try {
      const response = await staticApiFetch("/api/admin/meetings/reminders", {
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
    <div className="space-y-4">
      <section className="rounded-[24px] border border-border bg-card p-4 shadow-2xl shadow-black/10 dark:shadow-black/30 sm:rounded-[32px] sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Badge className="w-fit">Governance</Badge>
            <h2 className="max-w-3xl font-['Outfit'] text-xl font-semibold leading-tight text-foreground sm:text-2xl">
              Meetings, attendance, and attendance charges
            </h2>
            <p className="max-w-3xl text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-5">
              Each meeting or event uses the late and absence penalties selected by the administrator when it is scheduled.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isSendingReminders}
              onClick={() => void handleSendReminders()}
              size="sm"
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
            <MeetingFormDialog onCompleted={setFeedbackMessage} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="p-4">
            <CardDescription className="text-xs">Scheduled meetings</CardDescription>
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
              {totals.scheduled}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4">
            <CardDescription className="text-xs">Closed meetings</CardDescription>
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
              {totals.closed}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4">
            <CardDescription className="text-xs">Pending approvals</CardDescription>
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
              {totals.pendingApprovals}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4">
            <CardDescription className="text-xs">Attendance charges</CardDescription>
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
              {totals.pendingChargesCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-rose-400/20 bg-rose-500/10">
          <CardHeader className="p-4">
            <CardDescription className="text-xs">Pending charge value</CardDescription>
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
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

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-emerald-700 dark:text-emerald-100" />
          <h3 className="font-['Outfit'] text-xl font-semibold text-foreground">
            Scheduled meetings
          </h3>
        </div>

        {scheduledRows.length > 0 ? (
          <MeetingDateGroup
            meetings={scheduledRows}
            onCompleted={setFeedbackMessage}
            title="scheduled"
          />
        ) : (
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="font-['Outfit'] text-xl text-foreground">
                No scheduled meetings right now
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Create the next meeting and it will appear here for editing and live attendance tracking.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-sky-700 dark:text-sky-100" />
          <h3 className="font-['Outfit'] text-xl font-semibold text-foreground">
            Meeting reports
          </h3>
        </div>

        {historyRows.length > 0 ? (
          <MeetingDateGroup
            meetings={historyRows}
            onCompleted={setFeedbackMessage}
            title="history"
          />
        ) : (
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="font-['Outfit'] text-xl text-foreground">
                No meeting history yet
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Closed and cancelled meetings will stay here with their attendance reports.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>

      {totals.pendingApprovals > 0 ? (
        <Card className="border-amber-300/20 bg-amber-400/10">
          <CardHeader className="p-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-800 dark:text-amber-100" />
              <div>
                <CardTitle className="font-['Outfit'] text-xl text-foreground">
                  Attendance approvals waiting
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Review and approve marked attendance so the meeting report is fully confirmed.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
