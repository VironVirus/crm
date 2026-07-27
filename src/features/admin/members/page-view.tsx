"use client";

import { staticApiFetch } from "@/lib/static-api";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2, ShieldCheck } from "lucide-react";
import { COOPERATIVE_ROLES, type CooperativeRole } from "@/lib/auth/roles";
import { adminMemberUpdateSchema } from "@/lib/validation/admin";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatNaira } from "@/lib/loans";
import { type MemberTier } from "@/lib/member-tier";

type AdminMemberRow = {
  email: string;
  fullName: string;
  hasCompleteKyc: boolean;
  hasNextOfKin: boolean;
  id: string;
  isVerified: boolean;
  joinedAt: string;
  memberNumber: string | null;
  phone: string | null;
  role: CooperativeRole;
  savingsBalance: number;
  sharesValue: number;
  status: "active" | "inactive" | "suspended";
  tier: MemberTier;
  verificationNote: string | null;
};

type AdminMembersPageViewProps = {
  dataError?: string | null;
  rows: AdminMemberRow[];
  totals: {
    active: number;
    members: number;
    savings: number;
    shares: number;
    verified: number;
  };
};

type MemberUpdateValues = {
  isVerified: boolean;
  role: CooperativeRole;
  status: "active" | "inactive" | "suspended";
  verificationNote?: string | null;
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-700 dark:text-rose-100">{message}</p>;
}

function ManageMemberDialog({
  member,
  onCompleted,
}: {
  member: AdminMemberRow;
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
    watch,
  } = useForm<MemberUpdateValues>({
    resolver: zodResolver(adminMemberUpdateSchema),
    defaultValues: {
      isVerified: member.isVerified,
      role: member.role,
      status: member.status,
      verificationNote: member.verificationNote ?? "",
    },
  });
  const isVerified = watch("isVerified");

  const submit = handleSubmit(async (values) => {
    setServerError(null);

    const response = await staticApiFetch(`/api/admin/members/${member.id}`, {
      body: JSON.stringify(values),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setServerError(payload?.message ?? "Unable to update this member.");
      return;
    }

    onCompleted(payload?.message ?? "Member updated successfully.");
    setOpen(false);
    router.refresh();
  });

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          reset({
            isVerified: member.isVerified,
            role: member.role,
            status: member.status,
            verificationNote: member.verificationNote ?? "",
          });
          setServerError(null);
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Manage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage member</DialogTitle>
          <DialogDescription>
            Update the role, profile status, and verification state for {member.fullName}.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={submit}>
          <div className="rounded-2xl border border-border bg-secondary px-4 py-4 text-sm">
            <p className="font-medium text-foreground">{member.fullName}</p>
            <p className="mt-1 text-muted-foreground">
              {member.memberNumber ?? "Member number pending"} · {member.email}
            </p>
            <p className="mt-1 text-muted-foreground">
              Tier {member.tier.replace("tier_", "")} · KYC{" "}
              {member.hasCompleteKyc ? "ready" : "incomplete"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`role-${member.id}`}>Role</Label>
            <select
              className="flex h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-emerald-400/60"
              id={`role-${member.id}`}
              {...register("role")}
            >
              {COOPERATIVE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.replace("_", " ")}
                </option>
              ))}
            </select>
            <FieldMessage message={errors.role?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`status-${member.id}`}>Profile status</Label>
            <select
              className="flex h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-emerald-400/60"
              id={`status-${member.id}`}
              {...register("status")}
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="suspended">suspended</option>
            </select>
            <FieldMessage message={errors.status?.message} />
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm text-foreground">
            <input
              className="h-4 w-4"
              disabled={!member.hasCompleteKyc}
              type="checkbox"
              {...register("isVerified")}
            />
            Mark this member as verified
          </label>
          {!member.hasCompleteKyc ? (
            <p className="text-xs text-amber-800 dark:text-amber-100">
              Verification stays locked until the full KYC set has been uploaded.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={`verification-note-${member.id}`}>Verification note</Label>
            <Textarea
              id={`verification-note-${member.id}`}
              placeholder={
                isVerified
                  ? "Optional note for the member verification"
                  : "Optional note about the member profile"
              }
              {...register("verificationNote")}
            />
            <FieldMessage message={errors.verificationNote?.message} />
          </div>

          {serverError ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
              {serverError}
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save member"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminMembersPageView({
  dataError,
  rows,
  totals,
}: AdminMembersPageViewProps) {
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-border bg-card p-5 shadow-2xl shadow-black/10 dark:shadow-black/30 sm:rounded-[32px] sm:p-6">
        <Badge className="w-fit">Members</Badge>
        <h2 className="mt-4 max-w-xl font-['Outfit'] text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
          Member directory and verification
        </h2>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader>
            <CardDescription>Total members</CardDescription>
            <CardTitle className="font-['Outfit'] text-3xl text-foreground">
              {totals.members}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active members</CardDescription>
            <CardTitle className="font-['Outfit'] text-3xl text-foreground">
              {totals.active}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Verified members</CardDescription>
            <CardTitle className="font-['Outfit'] text-3xl text-foreground">
              {totals.verified}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total savings</CardDescription>
            <CardTitle className="font-['Outfit'] text-3xl text-foreground">
              {formatNaira(totals.savings)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total shares value</CardDescription>
            <CardTitle className="font-['Outfit'] text-3xl text-foreground">
              {formatNaira(totals.shares)}
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

      <Card>
        <CardHeader>
          <CardTitle className="font-['Outfit'] text-2xl text-foreground">
            Registered members
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-3xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{row.fullName}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.memberNumber ?? "Member number pending"} · {row.email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {row.phone ?? "No phone on file"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.role.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.tier.replace("_", " ").toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            row.status === "active"
                              ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100"
                              : row.status === "suspended"
                                ? "border-rose-400/20 bg-rose-500/10 text-rose-700 dark:text-rose-100"
                                : "border-amber-300/20 bg-amber-400/10 text-amber-800 dark:text-amber-100"
                          }
                          variant="outline"
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge
                            className={
                              row.isVerified
                                ? "border-sky-300/30 bg-sky-500/10 text-sky-700 dark:text-sky-100"
                                : "border-amber-300/20 bg-amber-400/10 text-amber-800 dark:text-amber-100"
                            }
                            variant="outline"
                          >
                            {row.isVerified ? "Verified" : "Pending"}
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            {row.hasCompleteKyc ? "KYC ready" : "KYC incomplete"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(row.joinedAt)}</TableCell>
                      <TableCell className="text-right">
                        <ManageMemberDialog
                          member={row}
                          onCompleted={(message) => setFeedbackMessage(message)}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={7}>
                      No member records have been created yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
