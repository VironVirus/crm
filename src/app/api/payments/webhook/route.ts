import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  FlutterwaveGatewayError,
  verifyFlutterwaveTransaction,
  verifyFlutterwaveWebhookSignature,
} from "@/lib/flutterwave/server";
import { sendMemberNotification } from "@/lib/notification-dispatch";
import {
  formatPaymentAmount,
  formatPaymentTypeLabel,
  isPaymentType,
  parsePaymentAmount,
  roundCurrency,
  type PaymentType,
} from "@/lib/payments";
import {
  recordLoanRepayment,
  recordSavingsDeposit,
  recordSharePurchase,
  PaymentProcessingError,
} from "@/lib/payment-processing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  SAVINGS_ACCOUNT_TYPES,
  type SavingsAccountType,
} from "@/lib/savings";
import {
  flutterwaveWebhookMetadataSchema,
  flutterwaveWebhookPayloadSchema,
} from "@/lib/validation/api";

export const runtime = "nodejs";

type PaymentLogStatus =
  | "received"
  | "processed"
  | "duplicate"
  | "invalid_signature"
  | "verification_failed"
  | "handler_failed";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

async function createPaymentLog(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  {
    errorMessage,
    flutterwaveTransactionId,
    memberId,
    paymentType,
    rawPayload,
    status,
    txRef,
  }: {
    errorMessage?: string | null;
    flutterwaveTransactionId?: string | null;
    memberId?: string | null;
    paymentType?: PaymentType | null;
    rawPayload: Record<string, unknown>;
    status?: PaymentLogStatus;
    txRef?: string | null;
  },
) {
  const { data, error } = await admin
    .from("payment_logs")
    .insert({
      error_message: errorMessage ?? null,
      flutterwave_transaction_id: flutterwaveTransactionId ?? null,
      member_id: memberId ?? null,
      payment_type: paymentType ?? null,
      raw_payload: rawPayload,
      status: status ?? "received",
      tx_ref: txRef ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to create a payment log.");
  }

  return data.id as string;
}

async function updatePaymentLog(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  {
    errorMessage,
    flutterwaveTransactionId,
    id,
    status,
  }: {
    errorMessage?: string | null;
    flutterwaveTransactionId?: string | null;
    id: string;
    status: PaymentLogStatus;
  },
) {
  await admin
    .from("payment_logs")
    .update({
      error_message: errorMessage ?? null,
      flutterwave_transaction_id: flutterwaveTransactionId ?? null,
      processed_at: new Date().toISOString(),
      status,
    })
    .eq("id", id);
}

function revalidatePaymentPaths(paymentType: PaymentType) {
  revalidatePath("/portal");

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
  const rawBody = await request.text();
  let payload: Record<string, unknown>;

  if (!verifyFlutterwaveWebhookSignature(rawBody, request.headers)) {
    return json({ message: "Invalid webhook signature." }, 401);
  }

  const admin = createSupabaseAdminClient();

  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    await createPaymentLog(admin, {
      errorMessage: "Webhook payload could not be parsed as JSON.",
      rawPayload: {
        parse_error: "invalid_json",
        raw_body: rawBody,
      },
      status: "handler_failed",
    });

    return json({ message: "Invalid webhook payload." }, 400);
  }

  const parsedPayload = flutterwaveWebhookPayloadSchema.safeParse(payload);

  if (!parsedPayload.success) {
    await createPaymentLog(admin, {
      errorMessage:
        parsedPayload.error.issues[0]?.message ??
        "Webhook payload failed schema validation.",
      rawPayload: payload,
      status: "handler_failed",
    });

    return json({ message: "Invalid webhook payload." }, 400);
  }

  const data =
    parsedPayload.data.data && typeof parsedPayload.data.data === "object"
      ? (parsedPayload.data.data as Record<string, unknown>)
      : (parsedPayload.data as Record<string, unknown>);
  const metadataCandidate =
    (data.meta as Record<string, unknown> | null | undefined) ??
    (data.meta_data as Record<string, unknown> | null | undefined) ??
    (data.metadata as Record<string, unknown> | null | undefined) ??
    {};
  const parsedMetadata =
    flutterwaveWebhookMetadataSchema.safeParse(metadataCandidate);
  const paymentType =
    parsedMetadata.success && isPaymentType(parsedMetadata.data.payment_type)
      ? parsedMetadata.data.payment_type
      : null;
  const memberId = parsedMetadata.success ? parsedMetadata.data.member_id : null;
  const txRef =
    typeof data.tx_ref === "string"
      ? data.tx_ref
      : typeof parsedPayload.data.tx_ref === "string"
        ? parsedPayload.data.tx_ref
        : null;
  const flutterwaveTransactionId =
    data.id !== undefined && data.id !== null ? String(data.id) : null;

  const paymentLogId = await createPaymentLog(admin, {
    flutterwaveTransactionId,
    memberId,
    paymentType,
    rawPayload: payload,
    txRef,
  });

  if (!paymentType || !memberId || !txRef) {
    await updatePaymentLog(admin, {
      errorMessage:
        "The webhook payload is missing one or more required payment metadata fields.",
      flutterwaveTransactionId,
      id: paymentLogId,
      status: "handler_failed",
    });

    return json({ message: "Incomplete payment metadata." }, 400);
  }

  const { data: processedLog, error: processedLogError } = await admin
    .from("payment_logs")
    .select("id")
    .eq("tx_ref", txRef)
    .eq("status", "processed")
    .neq("id", paymentLogId)
    .limit(1)
    .maybeSingle();

  if (processedLogError) {
    await updatePaymentLog(admin, {
      errorMessage:
        "Unable to verify whether this payment webhook was already processed.",
      flutterwaveTransactionId,
      id: paymentLogId,
      status: "handler_failed",
    });

    return json({ message: "Unable to verify prior webhook processing." }, 500);
  }

  if (processedLog) {
    await updatePaymentLog(admin, {
      flutterwaveTransactionId,
      id: paymentLogId,
      status: "duplicate",
    });

    return json({ ok: true, status: "duplicate" });
  }

  try {
    const verifiedTransaction = await verifyFlutterwaveTransaction({
      transactionId: flutterwaveTransactionId,
      txRef,
    });
    const verifiedTxRef = verifiedTransaction.tx_ref ?? null;
    const verifiedStatus = verifiedTransaction.status ?? null;
    const verifiedAmount = roundCurrency(
      parsePaymentAmount(verifiedTransaction.amount) > 0
        ? parsePaymentAmount(verifiedTransaction.amount)
        : parsePaymentAmount(verifiedTransaction.charged_amount),
    );
    const expectedAmountValue = metadataCandidate.expected_amount;
    const expectedAmount = roundCurrency(
      parsePaymentAmount(
        typeof expectedAmountValue === "number" ||
          typeof expectedAmountValue === "string"
          ? expectedAmountValue
          : null,
      ),
    );

    if (verifiedTxRef !== txRef) {
      throw new PaymentProcessingError(
        "Flutterwave verification returned a different transaction reference.",
        400,
      );
    }

    if (verifiedStatus !== "successful") {
      throw new PaymentProcessingError(
        "Flutterwave has not marked this payment as successful.",
        400,
      );
    }

    if (expectedAmount > 0 && verifiedAmount !== expectedAmount) {
      throw new PaymentProcessingError(
        "The verified payment amount does not match the expected amount.",
        400,
      );
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("id", memberId)
      .maybeSingle();

    if (profileError || !profile) {
      throw new PaymentProcessingError(
        "The member profile attached to this payment could not be found.",
        404,
      );
    }

    let handlingResult:
      | Awaited<ReturnType<typeof recordSavingsDeposit>>
      | Awaited<ReturnType<typeof recordLoanRepayment>>
      | Awaited<ReturnType<typeof recordSharePurchase>>;

    if (paymentType === "savings_deposit") {
      const accountType = metadataCandidate.account_type;

      if (
        typeof accountType !== "string" ||
        !SAVINGS_ACCOUNT_TYPES.includes(accountType as SavingsAccountType)
      ) {
        throw new PaymentProcessingError(
          "Savings payment metadata is missing a valid account type.",
          400,
        );
      }

      handlingResult = await recordSavingsDeposit(admin, {
        accountType: accountType as SavingsAccountType,
        amount: verifiedAmount,
        memberId,
        narration:
          typeof metadataCandidate.narration === "string"
            ? metadataCandidate.narration
            : undefined,
        paymentReference: txRef,
      });
    } else if (paymentType === "loan_repayment") {
      const loanId = metadataCandidate.loan_id;

      if (!isUuid(loanId)) {
        throw new PaymentProcessingError(
          "Loan repayment metadata is missing a valid loan reference.",
          400,
        );
      }

      handlingResult = await recordLoanRepayment(admin, {
        amount: verifiedAmount,
        loanId,
        memberId,
        paymentReference: txRef,
      });
    } else {
      handlingResult = await recordSharePurchase(admin, {
        amount: verifiedAmount,
        memberId,
        notes:
          typeof metadataCandidate.notes === "string"
            ? metadataCandidate.notes
            : undefined,
        paymentReference: txRef,
      });
    }

    if (handlingResult.status === "duplicate") {
      await updatePaymentLog(admin, {
        flutterwaveTransactionId,
        id: paymentLogId,
        status: "duplicate",
      });

      return json({ ok: true, status: "duplicate" });
    }

    const paymentLabel = formatPaymentTypeLabel(paymentType);
    const notificationResult = await sendMemberNotification(admin, {
      actionUrl:
        paymentType === "savings_deposit"
          ? "/portal/savings"
          : paymentType === "loan_repayment"
            ? "/portal/loans"
            : "/portal",
      contextLabel: `${paymentLabel} notification`,
      emailSubject: `${paymentLabel} confirmed - Ifemelumma Cooperative Society`,
      memberId,
      message: `We confirmed your ${paymentLabel.toLowerCase()} of ${formatPaymentAmount(
        verifiedAmount,
      )}. Reference: ${txRef}. ${handlingResult.detail}`,
      title: `${paymentLabel} confirmed`,
      type: "payment_received",
    });

    await updatePaymentLog(admin, {
      errorMessage:
        notificationResult.warnings.length > 0
          ? notificationResult.warnings.join(" ")
          : null,
      flutterwaveTransactionId,
      id: paymentLogId,
      status: "processed",
    });

    revalidatePaymentPaths(paymentType);

    return json({ ok: true, status: "processed" });
  } catch (error) {
    const paymentError =
      error instanceof PaymentProcessingError
        ? error
        : error instanceof FlutterwaveGatewayError
          ? new PaymentProcessingError(error.message, error.status)
        : new PaymentProcessingError(
            "The webhook could not be processed right now.",
            500,
          );

    await updatePaymentLog(admin, {
      errorMessage: paymentError.message,
      flutterwaveTransactionId,
      id: paymentLogId,
      status:
        paymentError.status >= 400 && paymentError.status < 500
          ? "verification_failed"
          : "handler_failed",
    });

    return json({ message: paymentError.message }, paymentError.status);
  }
}
