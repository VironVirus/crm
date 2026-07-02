import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { isFlutterwaveMockModeEnabled } from "@/lib/env/server";
import { readMockFlutterwaveSessionToken } from "@/lib/flutterwave/mock";
import { sendMemberNotification } from "@/lib/notification-dispatch";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  formatPaymentAmount,
  formatPaymentTypeLabel,
  type PaymentType,
} from "@/lib/payments";
import {
  recordLoanRepayment,
  recordSavingsDeposit,
  recordSharePurchase,
  PaymentProcessingError,
} from "@/lib/payment-processing";
import { SAVINGS_ACCOUNT_TYPES, type SavingsAccountType } from "@/lib/savings";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function revalidatePaymentPaths(paymentType: PaymentType) {
  revalidatePath("/portal");
  revalidatePath("/portal/actions");

  if (paymentType === "savings_deposit") {
    revalidatePath("/portal/savings");
    revalidatePath("/admin/finance");
    return;
  }

  if (paymentType === "loan_repayment") {
    revalidatePath("/portal/loans");
    revalidatePath("/admin/loans");
    return;
  }

  revalidatePath("/admin/shares");
}

export async function POST(request: NextRequest) {
  if (!isFlutterwaveMockModeEnabled()) {
    return jsonError("Mock payments are not enabled.", 404);
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the mock payment request.", 400);
  }

  const sessionToken =
    payload &&
    typeof payload === "object" &&
    "sessionToken" in payload &&
    typeof payload.sessionToken === "string"
      ? payload.sessionToken
      : null;

  if (!sessionToken) {
    return jsonError("A mock payment session token is required.", 400);
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before completing a payment.", 401);
  }

  let session;

  try {
    session = readMockFlutterwaveSessionToken(sessionToken);
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "This mock payment session could not be verified.",
      400,
    );
  }

  if (session.memberId !== user.id) {
    return jsonError("You can only complete payments for your own account.", 403);
  }

  const admin = createSupabaseAdminClient();

  try {
    const handlingResult =
      session.paymentType === "savings_deposit"
        ? await (() => {
            const accountType = session.metadata.account_type;

            if (
              typeof accountType !== "string" ||
              !SAVINGS_ACCOUNT_TYPES.includes(accountType as SavingsAccountType)
            ) {
              throw new PaymentProcessingError(
                "This mock savings payment is missing a valid account type.",
                400,
              );
            }

            return recordSavingsDeposit(admin, {
              accountType: accountType as SavingsAccountType,
              amount: session.amount,
              memberId: user.id,
              narration:
                typeof session.metadata.narration === "string"
                  ? session.metadata.narration
                  : undefined,
              paymentReference: session.txRef,
            });
          })()
        : session.paymentType === "loan_repayment"
          ? await (() => {
              const loanId = session.metadata.loan_id;

              if (typeof loanId !== "string") {
                throw new PaymentProcessingError(
                  "This mock loan repayment is missing a valid loan reference.",
                  400,
                );
              }

              return recordLoanRepayment(admin, {
                amount: session.amount,
                loanId,
                memberId: user.id,
                paymentReference: session.txRef,
              });
            })()
          : await recordSharePurchase(admin, {
              amount: session.amount,
              memberId: user.id,
              notes:
                typeof session.metadata.notes === "string"
                  ? session.metadata.notes
                  : undefined,
              paymentReference: session.txRef,
            });

    const paymentLabel = formatPaymentTypeLabel(session.paymentType);
    const notificationResult =
      handlingResult.status === "duplicate"
        ? { ok: true, warnings: [] as string[] }
        : await sendMemberNotification(admin, {
            actionUrl:
              session.paymentType === "savings_deposit"
                ? "/portal/savings"
                : session.paymentType === "loan_repayment"
                  ? "/portal/loans"
                  : "/portal/actions",
            contextLabel: `Mock ${paymentLabel} notification`,
            emailSubject: `${paymentLabel} confirmed - Ifemelunma Multi-Purpose Co-operative Society`,
            memberId: user.id,
            message: `We confirmed your demo ${paymentLabel.toLowerCase()} of ${formatPaymentAmount(
              session.amount,
            )}. Reference: ${session.txRef}. ${handlingResult.detail}`,
            title: `${paymentLabel} confirmed`,
            type: "payment_received",
          });

    await admin.from("payment_logs").insert({
      error_message:
        notificationResult.warnings.length > 0
          ? notificationResult.warnings.join(" ")
          : null,
      flutterwave_transaction_id: `mock-${session.txRef}`,
      member_id: user.id,
      payment_type: session.paymentType,
      processed_at: new Date().toISOString(),
      raw_payload: {
        description: session.description,
        member_name: session.memberName,
        mock: true,
        metadata: session.metadata,
        tx_ref: session.txRef,
      },
      status: handlingResult.status === "duplicate" ? "duplicate" : "processed",
      tx_ref: session.txRef,
    });

    revalidatePaymentPaths(session.paymentType);

    return NextResponse.json({
      redirectUrl: `/portal/actions?payment=success&tx_ref=${encodeURIComponent(session.txRef)}`,
    });
  } catch (error) {
    if (error instanceof PaymentProcessingError) {
      return jsonError(error.message, error.status);
    }

    return jsonError(
      "The mock payment could not be completed right now.",
      500,
    );
  }
}
