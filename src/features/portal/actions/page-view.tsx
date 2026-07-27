"use client";

import { staticApiFetch } from "@/lib/static-api";

import Link from "next/link";
import { useState } from "react";
import {
  BellRing,
  CreditCard,
  Download,
  Landmark,
  Loader2,
} from "lucide-react";
import { MakePaymentDialog } from "@/features/portal/dashboard/make-payment-dialog";
import { type MemberTier } from "@/lib/member-tier";
import {
  type MemberPaymentLoanOption,
  type MemberPaymentShareConfig,
} from "@/lib/payments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ActionCard({
  action,
  description,
  icon: Icon,
  title,
}: {
  action: React.ReactNode;
  description: string;
  icon: typeof CreditCard;
  title: string;
}) {
  return (
    <Card className="rounded-[26px]">
      <CardHeader className="space-y-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/15 text-emerald-700 dark:text-emerald-100">
          <Icon className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <CardTitle className="font-['Outfit'] text-xl text-foreground">
            {title}
          </CardTitle>
          <CardDescription className="text-sm leading-6">
            {description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>{action}</CardContent>
    </Card>
  );
}

export default function PortalActionsPageView({
  demoPaymentsEnabled,
  memberId,
  memberName,
  memberNumber,
  memberTier,
  paymentLoanOptions,
  paymentStatus,
  shareConfig,
}: {
  demoPaymentsEnabled: boolean;
  memberId: string;
  memberName: string;
  memberNumber: string | null;
  memberTier: MemberTier;
  paymentLoanOptions: MemberPaymentLoanOption[];
  paymentStatus: "success" | null;
  shareConfig: MemberPaymentShareConfig | null;
}) {
  const [statementError, setStatementError] = useState<string | null>(null);
  const [isGeneratingStatement, setIsGeneratingStatement] = useState(false);

  async function handleStatementDownload() {
    setStatementError(null);
    setIsGeneratingStatement(true);

    try {
      const response = await staticApiFetch("/api/portal/reports/member-statement");

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;

        throw new Error(
          payload?.message ?? "Unable to generate your statement right now.",
        );
      }

      const filename =
        response.headers
          .get("content-disposition")
          ?.match(/filename=\"([^\"]+)\"/)?.[1] ??
        `ifemelunma-member-statement-${new Date().toISOString().slice(0, 10)}.csv`;

      downloadBlob(await response.blob(), filename);
    } catch (error) {
      setStatementError(
        error instanceof Error
          ? error.message
          : "Unable to generate your statement right now.",
      );
    } finally {
      setIsGeneratingStatement(false);
    }
  }

  return (
    <div className="space-y-6">
      {paymentStatus === "success" ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
          Payment recorded successfully.
        </div>
      ) : null}

      {statementError ? (
        <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
          {statementError}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-border bg-card px-4 py-5 shadow-xl shadow-black/10 dark:shadow-black/30 sm:rounded-[28px] sm:px-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="w-fit">Actions</Badge>
            {demoPaymentsEnabled ? (
              <Badge className="w-fit" variant="secondary">
                Mock Flutterwave enabled
              </Badge>
            ) : null}
          </div>
          <h2 className="font-['Outfit'] text-2xl font-semibold text-foreground sm:text-3xl">
            Payment, loan, statement, and alerts
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose what you want to do next for {memberName}.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <ActionCard
          action={
            <MakePaymentDialog
              activeLoans={paymentLoanOptions}
              demoMode={demoPaymentsEnabled}
              memberId={memberId}
              memberName={memberName}
              memberNumber={memberNumber}
              memberTier={memberTier}
              shareConfig={shareConfig}
            />
          }
          description="Open Flutterwave checkout for savings, loans, or share payments."
          icon={CreditCard}
          title="Make payment"
        />

        <ActionCard
          action={
            <Button asChild className="w-full" variant="secondary">
              <Link href={memberTier === "tier_3" ? "/portal/loans" : "/portal/profile"}>
                {memberTier === "tier_3" ? "Apply for loan" : "Complete profile"}
              </Link>
            </Button>
          }
          description="Loan applications unlock fully at Tier 3."
          icon={Landmark}
          title="Loan access"
        />

        <ActionCard
          action={
            <Button
              className="w-full"
              disabled={isGeneratingStatement}
              onClick={() => void handleStatementDownload()}
              variant="secondary"
            >
              {isGeneratingStatement ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  View statement
                </>
              )}
            </Button>
          }
          description="Download your member statement as a CSV file."
          icon={Download}
          title="Statements"
        />

        <ActionCard
          action={
            <Button asChild className="w-full" variant="secondary">
              <Link href="/portal/notifications">Open notifications</Link>
            </Button>
          }
          description="Check approvals, reminders, guarantor requests, and payment updates."
          icon={BellRing}
          title="Notifications"
        />
      </section>
    </div>
  );
}
