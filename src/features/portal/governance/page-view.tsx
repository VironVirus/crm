"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronDown, Loader2, Vote } from "lucide-react";
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
  canMemberMarkAttendance,
  formatMeetingDateTime,
  groupMeetingsByDate,
  getAttendanceStatusLabel,
  getAttendanceStatusTone,
  getMeetingStatusLabel,
  getMeetingStatusTone,
  type MeetingAttendanceStatus,
  type MeetingStatus,
  type MemberChargeStatus,
} from "@/lib/meetings";
import { formatNaira } from "@/lib/loans";
import { getMemberTierMeta, type MemberTier } from "@/lib/member-tier";

type GovernanceMeetingRow = {
  agenda: string | null;
  absenceFee: number;
  attendanceApproved: boolean | null;
  attendanceClosesAt: string;
  attendanceMarkedAt: string | null;
  attendanceStatus: MeetingAttendanceStatus | null;
  chargeAmount: number;
  chargeStatus: MemberChargeStatus | null;
  id: string;
  latenessStartsAt: string;
  lateFee: number;
  location: string | null;
  reminderMessage: string | null;
  startsAt: string;
  status: MeetingStatus;
  title: string;
};

function MarkAttendanceButton({
  meeting,
  onCompleted,
}: {
  meeting: GovernanceMeetingRow;
  onCompleted: (message: string) => void;
}) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleMarkAttendance() {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/portal/meetings/${meeting.id}/attendance`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to record your attendance.");
      }

      onCompleted(payload?.message ?? "Attendance recorded successfully.");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to record your attendance.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        disabled={isSubmitting}
        onClick={() => void handleMarkAttendance()}
        size="sm"
        type="button"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Mark attendance"
        )}
      </Button>
      {errorMessage ? (
        <p className="text-xs text-rose-700 dark:text-rose-100">{errorMessage}</p>
      ) : null}
    </div>
  );
}

function MeetingDateGroup({
  children,
  count,
  defaultOpen = false,
  label,
}: {
  children: ReactNode;
  count: number;
  defaultOpen?: boolean;
  label: string;
}) {
  return (
    <details
      className="group overflow-hidden rounded-[22px] border border-border bg-card shadow-lg shadow-black/5 dark:shadow-black/20"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 marker:hidden sm:px-5">
        <div className="space-y-1">
          <p className="font-['Outfit'] text-lg font-semibold text-foreground">
            {label}
          </p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {count} meeting{count === 1 ? "" : "s"} on this date
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{count}</Badge>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
        </div>
      </summary>

      <div className="border-t border-border px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
        <div className="space-y-3">{children}</div>
      </div>
    </details>
  );
}

export default function PortalGovernancePageView({
  dataError,
  meetings,
  memberTier,
  pendingChargesAmount,
  pendingChargesCount,
}: {
  dataError?: string | null;
  meetings: GovernanceMeetingRow[];
  memberTier: MemberTier;
  pendingChargesAmount: number;
  pendingChargesCount: number;
}) {
  const tierMeta = getMemberTierMeta(memberTier);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const upcomingMeetings = meetings.filter((meeting) => meeting.status === "scheduled");
  const historyMeetings = meetings.filter((meeting) => meeting.status !== "scheduled");
  const upcomingGroups = useMemo(
    () => groupMeetingsByDate(upcomingMeetings),
    [upcomingMeetings],
  );
  const historyGroups = useMemo(
    () => groupMeetingsByDate(historyMeetings),
    [historyMeetings],
  );

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-border bg-card p-4 shadow-2xl shadow-black/10 dark:shadow-black/30 sm:rounded-[32px] sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Badge className="w-fit">Governance</Badge>
            <h2 className="font-['Outfit'] text-2xl font-semibold text-foreground">
              Meetings, attendance, and voting access
            </h2>
            <p className="max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-5">
              Mark attendance whenever a meeting opens. Your voting access is currently {tierMeta.label.toLowerCase()}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{tierMeta.label}</Badge>
            {tierMeta.canVote ? (
              <Badge className="border-emerald-300/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100" variant="outline">
                Voting enabled
              </Badge>
            ) : (
              <Badge className="border-amber-300/30 bg-amber-400/10 text-amber-800 dark:text-amber-100" variant="outline">
                Add next of kin to unlock voting
              </Badge>
            )}
          </div>
        </div>
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

      {pendingChargesCount > 0 ? (
        <Card className="border-rose-400/20 bg-rose-500/10">
          <CardHeader className="p-4">
            <CardTitle className="font-['Outfit'] text-xl text-foreground">
              Pending attendance charges
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {pendingChargesCount} charge{pendingChargesCount === 1 ? "" : "s"} awaiting settlement
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-rose-700 dark:text-rose-100 sm:text-sm">
            Your dashboard currently carries {formatNaira(pendingChargesAmount)} in meeting-related charges.
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-emerald-700 dark:text-emerald-100" />
          <h3 className="font-['Outfit'] text-xl font-semibold text-foreground">
            Open meetings
          </h3>
        </div>

        {upcomingGroups.length > 0 ? (
          upcomingGroups.map((group, groupIndex) => (
            <MeetingDateGroup
              count={group.meetings.length}
              defaultOpen={groupIndex === 0}
              key={group.dateKey}
              label={group.label}
            >
              {group.meetings.map((meeting) => {
            const canMark = !meeting.attendanceStatus
              ? canMemberMarkAttendance({
                  attendanceClosesAt: meeting.attendanceClosesAt,
                  startsAt: meeting.startsAt,
                  status: meeting.status,
                })
              : false;

            return (
              <Card className="rounded-[22px]" key={meeting.id}>
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
                        {meeting.attendanceStatus ? (
                          <Badge
                            className={getAttendanceStatusTone(meeting.attendanceStatus)}
                            variant="outline"
                          >
                            {getAttendanceStatusLabel(meeting.attendanceStatus)}
                          </Badge>
                        ) : null}
                      </div>
                      <CardDescription className="text-xs leading-5 sm:text-sm">
                        {meeting.agenda || "No agenda note added yet."}
                      </CardDescription>
                    </div>

                    {canMark ? (
                      <MarkAttendanceButton
                        meeting={meeting}
                        onCompleted={setFeedbackMessage}
                      />
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
                        Penalties
                      </p>
                      <p className="mt-1.5 text-xs font-medium text-foreground sm:text-sm">
                        Late {formatNaira(meeting.lateFee)} · Absent {formatNaira(meeting.absenceFee)}
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
                        Location
                      </p>
                      <p className="mt-1.5 text-xs font-medium text-foreground sm:text-sm">
                        {meeting.location || "Not set"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-secondary px-3 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                        Charge
                      </p>
                      <p className="mt-1.5 text-xs font-medium text-foreground sm:text-sm">
                        {meeting.chargeAmount > 0 ? formatNaira(meeting.chargeAmount) : "None"}
                      </p>
                    </div>
                  </div>

                  {meeting.attendanceStatus && meeting.attendanceMarkedAt ? (
                    <div className="rounded-2xl border border-border bg-secondary px-3 py-3 text-xs text-muted-foreground sm:text-sm">
                      Attendance marked on {formatMeetingDateTime(meeting.attendanceMarkedAt)}.{" "}
                      {meeting.attendanceApproved === false
                        ? "Admin approval is still pending."
                        : meeting.attendanceApproved
                          ? "This attendance has been approved."
                          : ""}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-border bg-secondary px-3 py-3 text-xs text-muted-foreground sm:text-sm">
                      Attendance opens up to one hour before the meeting, lateness starts counting from{" "}
                      {formatMeetingDateTime(meeting.latenessStartsAt)}, and attendance stays open until the close time.
                    </div>
                  )}

                  {meeting.reminderMessage ? (
                    <div className="rounded-2xl border border-border bg-secondary px-3 py-3 text-xs text-muted-foreground sm:text-sm">
                      <span className="font-medium text-foreground">Reminder:</span>{" "}
                      {meeting.reminderMessage}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
              })}
            </MeetingDateGroup>
          ))
        ) : (
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="font-['Outfit'] text-xl text-foreground">
                No open meetings right now
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                The next scheduled cooperative meeting will appear here automatically.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Vote className="h-5 w-5 text-amber-700 dark:text-amber-100" />
          <h3 className="font-['Outfit'] text-xl font-semibold text-foreground">
            Attendance history
          </h3>
        </div>

        {historyGroups.length > 0 ? (
          historyGroups.map((group, groupIndex) => (
            <MeetingDateGroup
              count={group.meetings.length}
              defaultOpen={groupIndex === 0}
              key={group.dateKey}
              label={group.label}
            >
              {group.meetings.map((meeting) => (
            <Card className="rounded-[22px]" key={meeting.id}>
              <CardHeader className="space-y-2 p-4 pb-3 sm:p-5 sm:pb-4">
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
                  {meeting.attendanceStatus ? (
                    <Badge
                      className={getAttendanceStatusTone(meeting.attendanceStatus)}
                      variant="outline"
                    >
                      {getAttendanceStatusLabel(meeting.attendanceStatus)}
                    </Badge>
                  ) : null}
                </div>
                <CardDescription className="text-xs sm:text-sm">
                  {formatMeetingDateTime(meeting.startsAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 text-xs text-muted-foreground sm:p-5 sm:pt-0 sm:text-sm">
                {meeting.chargeAmount > 0 ? (
                  <>Charge applied: {formatNaira(meeting.chargeAmount)}</>
                ) : (
                  <>No charge was applied for this meeting.</>
                )}
              </CardContent>
            </Card>
              ))}
            </MeetingDateGroup>
          ))
        ) : (
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="font-['Outfit'] text-xl text-foreground">
                No attendance history yet
              </CardTitle>
            </CardHeader>
          </Card>
        )}
      </section>

      {!tierMeta.canVote ? (
        <Card className="border-amber-300/20 bg-amber-400/10">
          <CardHeader className="p-4">
            <CardTitle className="font-['Outfit'] text-xl text-foreground">
              Upgrade to Tier 2
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4 pt-0 text-xs leading-5 text-amber-800 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between sm:text-sm">
            <p>Add your next of kin from your profile page to unlock society voting access.</p>
            <Button asChild size="sm">
              <Link href="/portal/profile">Open Profile</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
