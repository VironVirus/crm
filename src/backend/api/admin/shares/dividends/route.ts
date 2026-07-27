import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { isFinancialRecordManager } from "@/lib/auth/roles";
import { sendBatchMemberNotifications } from "@/lib/notification-dispatch";
import { formatNaira, parseSupabaseNumeric } from "@/lib/shares";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dividendDeclarationSchema } from "@/lib/validation/shares";

export const runtime = "nodejs";

type DividendDeclarationRecord = {
  id: string;
  dividend_per_share: number | string | null;
};

type CalculateDividendsResult = {
  dividendPerShare?: number;
  error?: string;
  paymentCount?: number;
};

type DividendPaymentRecord = {
  dividend_amount: number | string | null;
  member_id: string;
  shares_at_declaration: number;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function mapSupabaseMutationError(message: string | undefined) {
  const normalizedMessage = message?.toLowerCase() ?? "";

  if (
    normalizedMessage.includes("at least one issued share") ||
    normalizedMessage.includes("financial_year") ||
    normalizedMessage.includes("duplicate")
  ) {
    return {
      message,
      status: 400,
    };
  }

  return {
    message,
    status: 500,
  };
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the dividend declaration details.", 400);
  }

  const parsed = dividendDeclarationSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the dividend declaration details and try again.",
      400,
    );
  }

  const sessionClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before declaring dividends.", 401);
  }

  const { data: adminProfile } = await sessionClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!isFinancialRecordManager(adminProfile?.role)) {
    return jsonError(
      "Admin or treasurer access is required for this financial action.",
      403,
    );
  }

  const admin = createSupabaseAdminClient();

  const { data: declarationRecord, error: declarationError } = await admin
    .from("dividend_declarations")
    .insert({
      financial_year: parsed.data.financialYear,
      total_profit: parsed.data.totalProfit,
      declared_by: user.id,
      status: "declared",
    })
    .select("id, dividend_per_share")
    .single();

  if (declarationError || !declarationRecord) {
    const { message, status } = mapSupabaseMutationError(declarationError?.message);
    return jsonError(
      message ?? "Unable to declare dividends right now.",
      status,
    );
  }

  const calculationResult = await admin.functions.invoke("calculate-dividends", {
    body: {
      financialYear: parsed.data.financialYear,
    },
  });

  const calculationData = (calculationResult.data as CalculateDividendsResult | null) ?? null;

  const { count: paymentCount, error: paymentCountError } = await admin
    .from("dividend_payments")
    .select("id", { count: "exact", head: true })
    .eq("dividend_declaration_id", declarationRecord.id);

  if (paymentCountError) {
    return jsonError(
      "The dividend was declared, but the generated payment rows could not be verified.",
      500,
    );
  }

  revalidatePath("/admin/shares");

  const dividendPerShare =
    typeof calculationData?.dividendPerShare === "number"
      ? calculationData.dividendPerShare
      : parseSupabaseNumeric(
          (declarationRecord as DividendDeclarationRecord).dividend_per_share,
        );
  const calculationWarning =
    calculationResult.error || calculationData?.error
      ? " Dividend rows were still checked from the database, but the manual refresh function could not be confirmed."
      : "";
  const { data: dividendPayments, error: dividendPaymentsError } = await admin
    .from("dividend_payments")
    .select("member_id, dividend_amount, shares_at_declaration")
    .eq("dividend_declaration_id", declarationRecord.id);

  const notificationWarnings =
    dividendPaymentsError || !dividendPayments
      ? [
          "Dividend declarations were saved, but member notification rows could not be prepared for delivery.",
        ]
      : await sendBatchMemberNotifications(
          admin,
          (dividendPayments as DividendPaymentRecord[]).map((payment) => ({
            actionUrl: "/portal",
            contextLabel: `Dividend notification for ${payment.member_id}`,
            emailSubject: `Dividend update for ${parsed.data.financialYear} - Ifemelunma Multi-Purpose Co-operative Society`,
            memberId: payment.member_id,
            message: `A dividend payment of ${formatNaira(
              parseSupabaseNumeric(payment.dividend_amount),
            )} has been recorded for the ${parsed.data.financialYear} financial year based on your ${
              payment.shares_at_declaration
            } share${payment.shares_at_declaration === 1 ? "" : "s"}. Review your member portal for the latest dividend position.`,
            title: "Dividend payment recorded",
            type: "dividend_paid",
          })),
        );
  const deliveryWarning =
    notificationWarnings.length > 0
      ? ` ${notificationWarnings.length} member notification deliver${
          notificationWarnings.length === 1 ? "y needs" : "ies need"
        } review.`
      : "";

  return NextResponse.json(
    {
      dividendPerShare,
      message: `Dividend declaration saved and ${paymentCount ?? 0} member payment row${
        paymentCount === 1 ? "" : "s"
      } were generated.${calculationWarning}${deliveryWarning}`,
      warnings: notificationWarnings,
    },
    { status: 201 },
  );
}
