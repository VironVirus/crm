"use client";

import { staticApiFetch } from "@/lib/static-api";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  CalendarDays,
  CircleDollarSign,
  HandCoins,
  Landmark,
  Loader2,
  Plus,
  ReceiptText,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  getChargeCategoryLabel,
  type ChargeStatus,
  type CooperativeMemberOption,
  type InvestmentPlanSummary,
  type MemberChargeSummary,
  type MemberInvestmentSummary,
  type OccasionLevySummary,
} from "@/lib/cooperative-finance";
import { formatDisplayDate, formatNaira } from "@/lib/loans";

const SELECT_CLASS_NAME =
  "flex h-11 w-full rounded-2xl border border-input bg-background/70 px-4 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50";

async function postAdminAction(body: unknown) {
  const response = await staticApiFetch("/api/admin/cooperative-finance", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? "Unable to complete this action.");
  }

  return payload?.message ?? "Saved successfully.";
}

function FormFeedback({ error }: { error: string | null }) {
  return error ? (
    <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
      {error}
    </div>
  ) : null;
}

function InvestmentPlanDialog({ onCompleted }: { onCompleted: (message: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const message = await postAdminAction({
        action: "create_investment_plan",
        data: {
          description: form.get("description"),
          endsOn: form.get("endsOn"),
          name: form.get("name"),
          projectedReturnRate: form.get("projectedReturnRate") || null,
          startsOn: form.get("startsOn"),
        },
      });
      setOpen(false);
      onCompleted(message);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create the plan.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Investment plan</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add investment plan</DialogTitle>
          <DialogDescription>Create a plan such as real estate, agriculture, or fixed income.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="plan-name">Plan name</Label><Input id="plan-name" name="name" placeholder="Real Estate Plan" required /></div>
          <div className="space-y-2"><Label htmlFor="plan-return">Projected return (%)</Label><Input id="plan-return" min="0" name="projectedReturnRate" step="0.01" type="number" /></div>
          <div className="space-y-2"><Label htmlFor="plan-start">Start date</Label><Input id="plan-start" name="startsOn" type="date" /></div>
          <div className="space-y-2"><Label htmlFor="plan-end">End date</Label><Input id="plan-end" name="endsOn" type="date" /></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="plan-description">Description</Label><Textarea id="plan-description" name="description" placeholder="What the cooperative is investing in and how members participate." /></div>
          <div className="md:col-span-2"><FormFeedback error={error} /></div>
          <div className="flex justify-end md:col-span-2"><Button disabled={submitting} type="submit">{submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Create plan"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MemberInvestmentDialog({ members, onCompleted, plans }: { members: CooperativeMemberOption[]; onCompleted: (message: string) => void; plans: InvestmentPlanSummary[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const message = await postAdminAction({
        action: "record_member_investment",
        data: {
          amount: form.get("amount"),
          investedAt: form.get("investedAt"),
          memberId: form.get("memberId"),
          notes: form.get("notes"),
          planId: form.get("planId"),
        },
      });
      setOpen(false);
      onCompleted(message);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to record the investment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary"><HandCoins className="mr-2 h-4 w-4" />Record investment</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record member investment</DialogTitle><DialogDescription>Add a member's invested amount to an active plan.</DialogDescription></DialogHeader>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-2"><Label htmlFor="investment-member">Member</Label><select className={SELECT_CLASS_NAME} id="investment-member" name="memberId" required><option value="">Choose member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.fullName} · {member.memberNumber}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="investment-plan">Plan</Label><select className={SELECT_CLASS_NAME} id="investment-plan" name="planId" required><option value="">Choose plan</option>{plans.filter((plan) => plan.status === "active").map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="investment-amount">Amount invested</Label><Input id="investment-amount" min="1" name="amount" step="0.01" type="number" required /></div>
          <div className="space-y-2"><Label htmlFor="investment-date">Investment date</Label><Input defaultValue={today} id="investment-date" name="investedAt" type="date" required /></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="investment-notes">Notes</Label><Textarea id="investment-notes" name="notes" placeholder="Optional reference or allocation note" /></div>
          <div className="md:col-span-2"><FormFeedback error={error} /></div>
          <div className="flex justify-end md:col-span-2"><Button disabled={submitting || plans.every((plan) => plan.status !== "active")} type="submit">{submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Record investment"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OccasionLevyDialog({ members, onCompleted }: { members: CooperativeMemberOption[]; onCompleted: (message: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"all_members" | "single_member">("all_members");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const dueAt = String(form.get("dueAt") ?? "");

    try {
      const message = await postAdminAction({
        action: "create_occasion_levy",
        data: {
          amount: form.get("amount"),
          description: form.get("description"),
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          targetMemberId: scope === "single_member" ? form.get("targetMemberId") : null,
          targetScope: scope,
          title: form.get("title"),
        },
      });
      setOpen(false);
      onCompleted(message);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create the levy.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary"><ReceiptText className="mr-2 h-4 w-4" />Occasion levy</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add member occasion levy</DialogTitle><DialogDescription>Apply an occasion levy to every active member or one selected member.</DialogDescription></DialogHeader>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="levy-title">Occasion</Label><Input id="levy-title" name="title" placeholder="Member wedding support" required /></div>
          <div className="space-y-2"><Label htmlFor="levy-amount">Amount per member</Label><Input id="levy-amount" min="1" name="amount" step="0.01" type="number" required /></div>
          <div className="space-y-2"><Label htmlFor="levy-due">Due date</Label><Input id="levy-due" name="dueAt" type="datetime-local" /></div>
          <div className="space-y-2"><Label htmlFor="levy-scope">Apply to</Label><select className={SELECT_CLASS_NAME} id="levy-scope" name="targetScope" onChange={(event) => setScope(event.target.value as typeof scope)} value={scope}><option value="all_members">All active members</option><option value="single_member">One member</option></select></div>
          {scope === "single_member" ? <div className="space-y-2"><Label htmlFor="levy-member">Member</Label><select className={SELECT_CLASS_NAME} id="levy-member" name="targetMemberId" required><option value="">Choose member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.fullName} · {member.memberNumber}</option>)}</select></div> : null}
          <div className="space-y-2 md:col-span-2"><Label htmlFor="levy-description">Description</Label><Textarea id="levy-description" name="description" placeholder="What the levy supports" /></div>
          <div className="md:col-span-2"><FormFeedback error={error} /></div>
          <div className="flex justify-end md:col-span-2"><Button disabled={submitting} type="submit">{submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Applying...</> : "Apply levy"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChargeStatusActions({ charge, onCompleted }: { charge: MemberChargeSummary; onCompleted: (message: string) => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<ChargeStatus | null>(null);

  async function updateStatus(status: ChargeStatus) {
    setSubmitting(status);
    try {
      onCompleted(await postAdminAction({ action: "update_charge_status", data: { chargeId: charge.id, status } }));
      router.refresh();
    } catch (caught) {
      onCompleted(caught instanceof Error ? caught.message : "Unable to update the charge.");
    } finally {
      setSubmitting(null);
    }
  }

  if (charge.status !== "pending") return <Badge variant="outline" className="capitalize">{charge.status}</Badge>;

  return <div className="flex flex-wrap justify-end gap-2"><Button disabled={Boolean(submitting)} onClick={() => void updateStatus("paid")} size="sm" type="button">{submitting === "paid" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark paid"}</Button><Button disabled={Boolean(submitting)} onClick={() => void updateStatus("waived")} size="sm" type="button" variant="secondary">Waive</Button></div>;
}

export default function AdminOperationsPageView({ charges, currentMonthLabel, currentMonthStart, dataError, investments, levies, members, plans }: { charges: MemberChargeSummary[]; currentMonthLabel: string; currentMonthStart: string; dataError?: string | null; investments: MemberInvestmentSummary[]; levies: OccasionLevySummary[]; members: CooperativeMemberOption[]; plans: InvestmentPlanSummary[] }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [generatingDues, setGeneratingDues] = useState(false);
  const router = useRouter();
  const pending = charges.filter((charge) => charge.status === "pending");
  const monthlyDues = charges.filter(
    (charge) =>
      charge.category === "monthly_due" &&
      charge.createdAt.slice(0, 10) >= currentMonthStart,
  );
  const totalInvested = useMemo(() => investments.reduce((total, row) => total + row.amount, 0), [investments]);
  const pendingByCategory = (category: MemberChargeSummary["category"]) => pending.filter((charge) => charge.category === category).reduce((total, charge) => total + charge.amount, 0);

  async function generateDues() {
    setGeneratingDues(true);
    try {
      setFeedback(await postAdminAction({ action: "generate_monthly_dues" }));
      router.refresh();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : "Unable to generate dues.");
    } finally {
      setGeneratingDues(false);
    }
  }

  return <div className="space-y-6">
    <section className="rounded-[32px] border border-border bg-card p-6 shadow-2xl shadow-black/10 dark:shadow-black/30">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div className="space-y-3"><Badge className="w-fit">Cooperative operations</Badge><h2 className="font-['Outfit'] text-2xl font-semibold text-foreground sm:text-3xl">Dues, investments, levies, and penalties</h2><p className="max-w-2xl text-sm leading-6 text-muted-foreground">Manage recurring obligations and member investments without leaving the existing financial workflow.</p></div><div className="flex flex-wrap gap-2"><InvestmentPlanDialog onCompleted={setFeedback} /><MemberInvestmentDialog members={members} onCompleted={setFeedback} plans={plans} /><OccasionLevyDialog members={members} onCompleted={setFeedback} /></div></div>
    </section>
    {dataError ? <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">Apply the cooperative financial features database patch before using this page. {dataError}</div> : null}
    {feedback ? <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">{feedback}</div> : null}
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card><CardHeader><CalendarDays className="h-5 w-5 text-emerald-700 dark:text-emerald-200" /><CardTitle className="text-base">{currentMonthLabel} dues</CardTitle><CardDescription>₦10,000 per active member</CardDescription></CardHeader><CardContent><p className="font-['Outfit'] text-3xl font-semibold">{formatNaira(monthlyDues.reduce((total, charge) => total + charge.amount, 0))}</p><Button className="mt-4 w-full" disabled={generatingDues} onClick={() => void generateDues()} size="sm" variant="secondary">{generatingDues ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking...</> : "Sync monthly dues"}</Button></CardContent></Card>
      <Card><CardHeader><Landmark className="h-5 w-5 text-sky-700 dark:text-sky-200" /><CardTitle className="text-base">Member investments</CardTitle><CardDescription>{plans.length} plan{plans.length === 1 ? "" : "s"}</CardDescription></CardHeader><CardContent className="font-['Outfit'] text-3xl font-semibold">{formatNaira(totalInvested)}</CardContent></Card>
      <Card><CardHeader><ReceiptText className="h-5 w-5 text-amber-700 dark:text-amber-200" /><CardTitle className="text-base">Occasion levies due</CardTitle><CardDescription>Outstanding member occasions</CardDescription></CardHeader><CardContent className="font-['Outfit'] text-3xl font-semibold">{formatNaira(pendingByCategory("occasion_levy"))}</CardContent></Card>
      <Card><CardHeader><BadgeDollarSign className="h-5 w-5 text-rose-700 dark:text-rose-200" /><CardTitle className="text-base">Attendance penalties</CardTitle><CardDescription>Late and absent charges</CardDescription></CardHeader><CardContent className="font-['Outfit'] text-3xl font-semibold">{formatNaira(pendingByCategory("meeting_penalty"))}</CardContent></Card>
    </section>
    <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <Card><CardHeader><CardTitle className="font-['Outfit'] text-2xl">Investment plans</CardTitle><CardDescription>Every allocation appears immediately on the member dashboard.</CardDescription></CardHeader><CardContent className="grid gap-3">{plans.length ? plans.map((plan) => <div key={plan.id} className="rounded-3xl border border-border bg-secondary p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-foreground">{plan.name}</p><p className="mt-1 text-sm text-muted-foreground">{plan.description || "No description added."}</p></div><Badge variant={plan.status === "active" ? "secondary" : "outline"}>{plan.status}</Badge></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-2xl bg-card p-3"><p className="text-muted-foreground">Invested</p><p className="mt-1 font-semibold">{formatNaira(plan.totalInvested)}</p></div><div className="rounded-2xl bg-card p-3"><p className="text-muted-foreground">Members</p><p className="mt-1 font-semibold">{plan.investorCount.toLocaleString("en-NG")}</p></div></div></div>) : <p className="text-sm text-muted-foreground">No investment plan has been added yet.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="font-['Outfit'] text-2xl">Recent investments</CardTitle></CardHeader><CardContent className="space-y-3">{investments.slice(0, 8).map((row) => <div key={row.id} className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-secondary p-4"><div><p className="font-medium text-foreground">{row.memberName}</p><p className="text-sm text-muted-foreground">{row.planName} · {formatDisplayDate(row.investedAt)}</p></div><p className="font-semibold text-emerald-700 dark:text-emerald-200">{formatNaira(row.amount)}</p></div>)}{investments.length === 0 ? <p className="text-sm text-muted-foreground">No member investments recorded yet.</p> : null}</CardContent></Card>
    </section>
    <Card><CardHeader><div className="flex items-center gap-3"><CircleDollarSign className="h-5 w-5 text-emerald-700 dark:text-emerald-200" /><div><CardTitle className="font-['Outfit'] text-2xl">Member obligations</CardTitle><CardDescription>Monthly dues, occasion levies, and attendance penalties in one register.</CardDescription></div></div></CardHeader><CardContent><div className="overflow-x-auto rounded-3xl border border-border"><Table><TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Charge</TableHead><TableHead>Category</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Status</TableHead></TableRow></TableHeader><TableBody>{charges.slice(0, 80).map((charge) => <TableRow key={charge.id}><TableCell><p className="font-medium text-foreground">{charge.memberName}</p><p className="text-xs text-muted-foreground">{charge.memberNumber ?? "Pending number"}</p></TableCell><TableCell>{charge.title}</TableCell><TableCell><Badge variant="secondary">{getChargeCategoryLabel(charge.category)}</Badge></TableCell><TableCell>{charge.dueAt ? formatDisplayDate(charge.dueAt) : "No date"}</TableCell><TableCell className="text-right font-medium">{formatNaira(charge.amount)}</TableCell><TableCell className="text-right"><ChargeStatusActions charge={charge} onCompleted={setFeedback} /></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
    {levies.length > 0 ? <Card><CardHeader><CardTitle className="font-['Outfit'] text-2xl">Occasion levy history</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{levies.map((levy) => <div key={levy.id} className="rounded-3xl border border-border bg-secondary p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-foreground">{levy.title}</p><p className="mt-1 text-sm text-muted-foreground">{levy.targetLabel}</p></div><Badge variant="outline">{formatNaira(levy.amount)}</Badge></div>{levy.description ? <p className="mt-3 text-sm text-muted-foreground">{levy.description}</p> : null}</div>)}</CardContent></Card> : null}
  </div>;
}
