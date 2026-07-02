import { NextResponse, type NextRequest } from "next/server";
import { getAppUrl, isFlutterwaveMockModeEnabled } from "@/lib/env/server";
import { createMockFlutterwaveSessionToken } from "@/lib/flutterwave/mock";
import {
  createFlutterwavePaymentLink,
  FlutterwaveGatewayError,
  getFlutterwaveRedirectUrl,
} from "@/lib/flutterwave/server";
import {
  getLoanRepaymentTarget,
  getSharePurchaseQuote,
  PaymentProcessingError,
} from "@/lib/payment-processing";
import {
  buildFlutterwaveTxRef,
  formatPaymentTypeLabel,
  roundCurrency,
} from "@/lib/payments";
import { getMemberTier } from "@/lib/member-tier";
import { ensureMemberRecord } from "@/lib/members";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatAccountTypeLabel } from "@/lib/savings";
import { initiatePaymentSchema } from "@/lib/validation/payments";

export const runtime = "nodejs";

type ProfileRecord = {
  email: string;
  full_name: string;
  member_number: string | null;
  phone: string | null;
  status: "active" | "inactive" | "suspended";
};

type MemberRecord = {
  id: string;
  national_id_path: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  onboarding_status: "pending" | "registered";
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

type PaymentRateLimitResult = {
  allowed?: boolean;
  remaining?: number;
  reset_at?: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the payment details.", 400);
  }

  const parsed = initiatePaymentSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the payment details and try again.",
      400,
    );
  }

  const sessionClient = createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before making a payment.", 401);
  }

  if (user.id !== parsed.data.member_id) {
    return jsonError(
      "You can only initiate payments for your own member account.",
      403,
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: rateLimitData, error: rateLimitError } = await admin.rpc(
    "check_payment_initiation_rate_limit",
    {
      p_limit: 5,
      p_member_id: user.id,
      p_window_seconds: 60,
    },
  );

  if (rateLimitError) {
    return jsonError(
      "Unable to verify the payment rate limit right now.",
      500,
    );
  }

  const rateLimit = rateLimitData as PaymentRateLimitResult | null;

  if (rateLimit?.allowed === false) {
    return NextResponse.json(
      {
        message:
          "Too many payment attempts. Please wait a minute before trying again.",
        resetAt: rateLimit.reset_at ?? null,
      },
      { status: 429 },
    );
  }

  const profileResult = await admin
    .from("profiles")
    .select("full_name, email, phone, member_number, status")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileResult.data as ProfileRecord | null;
  const profileError = profileResult.error;
  const memberResult = await ensureMemberRecord(admin, {
    memberId: user.id,
    memberNumber: profile?.member_number ?? null,
    select:
      "id, onboarding_status, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
  });
  const member = memberResult.data as MemberRecord | null;
  const memberError = memberResult.error;

  if (profileError || !profile) {
    return jsonError("Your member profile could not be loaded.", 404);
  }

  if (memberError || !member) {
    return jsonError(
      "Complete your member registration before collecting payments online.",
      404,
    );
  }

  const profileRecord = profile;
  const memberRecord = member;

  if (profileRecord.status !== "active") {
    return jsonError(
      "Only active members can start new payments right now.",
      403,
    );
  }

  if (memberRecord.onboarding_status !== "registered") {
    return jsonError(
      "Finish your cooperative onboarding before making payments online.",
      409,
    );
  }

  const memberTier = getMemberTier(memberRecord);

  const amount = roundCurrency(parsed.data.amount);
  const txRef = buildFlutterwaveTxRef(profileRecord.member_number);
  let description = formatPaymentTypeLabel(parsed.data.payment_type);
  let meta: Record<string, unknown> = {};

  try {
    switch (parsed.data.payment_type) {
      case "savings_deposit": {
        description = `Savings deposit for your ${formatAccountTypeLabel(
          parsed.data.metadata.account_type,
        ).toLowerCase()} account`;
        meta = {
          account_type: parsed.data.metadata.account_type,
          expected_amount: amount,
          member_id: user.id,
          member_number: profileRecord.member_number,
          narration: parsed.data.metadata.narration ?? null,
          payment_type: parsed.data.payment_type,
        };
        break;
      }
      case "loan_repayment": {
        if (memberTier !== "tier_3") {
          return jsonError(
            "Complete your profile to Tier 3 before using loan payments online.",
            403,
          );
        }

        const loan = await getLoanRepaymentTarget(admin, {
          loanId: parsed.data.metadata.loan_id,
          memberId: user.id,
        });

        if (amount > roundCurrency(Number(loan.outstanding_balance ?? 0))) {
          return jsonError(
            "Repayment amount cannot exceed your current outstanding balance.",
            400,
          );
        }

        description = "Loan repayment";
        meta = {
          expected_amount: amount,
          loan_id: parsed.data.metadata.loan_id,
          member_id: user.id,
          member_number: profileRecord.member_number,
          narration: parsed.data.metadata.narration ?? null,
          payment_type: parsed.data.payment_type,
        };
        break;
      }
      case "share_purchase": {
        if (memberTier !== "tier_3") {
          return jsonError(
            "Complete your profile to Tier 3 before buying shares online.",
            403,
          );
        }

        const quote = await getSharePurchaseQuote(admin, amount);
        description = `Share purchase for ${quote.sharesCount} share unit${
          quote.sharesCount === 1 ? "" : "s"
        }`;
        meta = {
          expected_amount: amount,
          member_id: user.id,
          member_number: profileRecord.member_number,
          minimum_shares: quote.minimumShares,
          notes: parsed.data.metadata.notes ?? null,
          payment_type: parsed.data.payment_type,
          share_value: quote.shareValue,
          shares_count: quote.sharesCount,
        };
        break;
      }
      default: {
        return jsonError("Unsupported payment type.", 400);
      }
    }

    let paymentLink: string;

    if (isFlutterwaveMockModeEnabled()) {
      const mockSessionToken = createMockFlutterwaveSessionToken({
        amount,
        description,
        memberId: user.id,
        memberName: profileRecord.full_name,
        memberNumber: profileRecord.member_number,
        metadata: meta,
        paymentType: parsed.data.payment_type,
        txRef,
      });
      const appUrl = (getAppUrl() ?? "http://localhost:3000").replace(/\/$/, "");

      paymentLink = `${appUrl}/portal/payments/mock?session=${encodeURIComponent(mockSessionToken)}`;
    } else {
      const flutterwaveCheckout = await createFlutterwavePaymentLink({
        amount,
        customer: {
          email: profileRecord.email,
          name: profileRecord.full_name,
          phonenumber: profileRecord.phone,
        },
        customizations: {
          description,
          title: "Ifemelunma Multi-Purpose Co-operative Society",
        },
        meta,
        redirect_url: getFlutterwaveRedirectUrl(txRef),
        tx_ref: txRef,
      });

      paymentLink = flutterwaveCheckout.paymentLink;
    }

    return NextResponse.json({
      paymentLink,
      txRef,
    });
  } catch (error) {
    if (
      error instanceof PaymentProcessingError ||
      error instanceof FlutterwaveGatewayError
    ) {
      return jsonError(error.message, error.status);
    }

    return jsonError(
      "We could not start the payment checkout right now.",
      500,
    );
  }
}
