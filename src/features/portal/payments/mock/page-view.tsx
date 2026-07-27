"use client";

import { staticApiFetch } from "@/lib/static-api";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function MockPaymentPageView({
  amountLabel,
  description,
  memberName,
  memberNumber,
  paymentTypeLabel,
  sessionToken,
}: {
  amountLabel: string;
  description: string;
  memberName: string;
  memberNumber: string | null;
  paymentTypeLabel: string;
  sessionToken: string;
}) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCompletePayment() {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await staticApiFetch("/api/payments/mock/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionToken,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string; redirectUrl?: string }
        | null;

      if (!response.ok || !payload?.redirectUrl) {
        throw new Error(
          payload?.message ?? "The demo payment could not be completed.",
        );
      }

      router.replace(payload.redirectUrl);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The demo payment could not be completed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {errorMessage ? (
        <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      <Card className="rounded-[28px] border-border bg-card shadow-xl shadow-black/10 dark:shadow-black/30">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="w-fit">Mock Flutterwave</Badge>
            <Badge className="w-fit" variant="secondary">
              Demo checkout
            </Badge>
          </div>
          <CardTitle className="font-['Outfit'] text-2xl text-foreground sm:text-3xl">
            Confirm demo payment
          </CardTitle>
          <CardDescription className="text-sm leading-6">
            This screen simulates Flutterwave for local demos and records the payment inside the cooperative app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-3xl border border-border bg-secondary p-5">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/15 text-emerald-700 dark:text-emerald-100">
              <CreditCard className="h-5 w-5" />
            </div>
            <p className="font-medium text-foreground">{memberName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {memberNumber ?? "Member number pending"}
            </p>
            <p className="mt-4 text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Payment type
            </p>
            <p className="mt-1 text-sm text-foreground">{paymentTypeLabel}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Amount
            </p>
            <p className="mt-1 font-['Outfit'] text-2xl font-semibold text-foreground">
              {amountLabel}
            </p>
            <p className="mt-4 text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Description
            </p>
            <p className="mt-1 text-sm leading-6 text-foreground">{description}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button asChild size="lg" variant="secondary">
              <Link href="/portal/actions">Cancel</Link>
            </Button>
            <Button
              className="w-full"
              disabled={isSubmitting}
              onClick={() => void handleCompletePayment()}
              size="lg"
              type="button"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Complete demo payment"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
