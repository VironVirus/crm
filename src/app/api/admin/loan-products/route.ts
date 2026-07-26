import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { loanProductManagementSchema } from "@/lib/validation/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the loan product details.", 400);
  }

  const parsed = loanProductManagementSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the loan product details and try again.",
      400,
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before creating a loan product.", 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return jsonError("Only administrators can create loan products.", 403);
  }

  const { error } = await admin.from("loan_products").insert({
    name: parsed.data.name,
    description: parsed.data.description || null,
    interest_rate: parsed.data.interestRate,
    interest_type: parsed.data.interestType,
    is_active: parsed.data.isActive,
    max_amount: parsed.data.maxAmount,
    max_loan_to_savings_ratio: parsed.data.maxLoanToSavingsRatio,
    max_tenure_months: parsed.data.maxTenureMonths,
    maximum_disbursable_amount: parsed.data.maximumDisbursableAmount ?? null,
    min_amount: parsed.data.minAmount,
    min_tenure_months: parsed.data.minTenureMonths,
    penalty_rate: parsed.data.penaltyRate,
    processing_fee_rate: parsed.data.processingFeeRate,
    terms_summary: parsed.data.termsSummary || null,
  });

  if (error) {
    return jsonError(error.message ?? "Unable to create the loan product.", 500);
  }

  revalidatePath("/admin/loans");
  revalidatePath("/admin/settings");
  revalidatePath("/portal/loans");

  return NextResponse.json({
    message: "Loan product created successfully.",
  });
}
