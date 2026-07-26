import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { formatNaira } from "@/lib/loans";
import { ensureCurrentMonthlyDues } from "@/lib/cooperative-finance-server";
import {
  sendBatchMemberNotifications,
  sendMemberNotification,
} from "@/lib/notification-dispatch";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminCooperativeFinanceActionSchema } from "@/lib/validation/admin";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function revalidateFinanceViews() {
  revalidatePath("/admin");
  revalidatePath("/admin/operations");
  revalidatePath("/portal");
  revalidatePath("/portal/financials");
  revalidatePath("/portal/notifications");
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the cooperative finance request.", 400);
  }

  const parsed = adminCooperativeFinanceActionSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the submitted details and try again.",
      400,
    );
  }

  const sessionClient = createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before managing cooperative finances.", 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: actingProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (actingProfile?.role !== "admin") {
    return jsonError("Only administrators can manage cooperative finances.", 403);
  }

  if (parsed.data.action === "generate_monthly_dues") {
    const generationError = await ensureCurrentMonthlyDues(admin, user.id);

    if (generationError) {
      return jsonError(generationError, 500);
    }

    revalidateFinanceViews();
    return NextResponse.json({
      message: "This month's ₦10,000 dues are up to date for all active members.",
    });
  }

  if (parsed.data.action === "create_investment_plan") {
    const { data } = parsed.data;
    const { error } = await admin.from("investment_plans").insert({
      created_by: user.id,
      description: data.description || null,
      ends_on: data.endsOn || null,
      name: data.name,
      projected_return_rate: data.projectedReturnRate ?? null,
      starts_on: data.startsOn || null,
    });

    if (error) {
      return jsonError(error.message ?? "Unable to create the investment plan.", 500);
    }

    revalidateFinanceViews();
    return NextResponse.json({ message: "Investment plan created successfully." });
  }

  if (parsed.data.action === "record_member_investment") {
    const { data } = parsed.data;
    const [{ data: member }, { data: plan }] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, member_number, status")
        .eq("id", data.memberId)
        .maybeSingle(),
      admin
        .from("investment_plans")
        .select("id, name, status")
        .eq("id", data.planId)
        .maybeSingle(),
    ]);

    if (!member || member.status !== "active" || !member.member_number) {
      return jsonError("Choose an active registered member.", 404);
    }

    if (!plan || plan.status !== "active") {
      return jsonError("Choose an active investment plan.", 404);
    }

    const { error } = await admin.from("member_investments").insert({
      amount: data.amount,
      created_by: user.id,
      invested_at: data.investedAt,
      investment_plan_id: data.planId,
      member_id: data.memberId,
      notes: data.notes || null,
    });

    if (error) {
      return jsonError(error.message ?? "Unable to record the member investment.", 500);
    }

    await sendMemberNotification(admin, {
      actionUrl: "/portal",
      contextLabel: `Investment recorded for ${data.memberId}`,
      memberId: data.memberId,
      message: `${formatNaira(data.amount)} has been recorded under ${plan.name}. It is now visible on your dashboard.`,
      title: "Investment recorded",
      type: "payment_received",
    });

    revalidateFinanceViews();
    return NextResponse.json({ message: "Member investment recorded successfully." });
  }

  if (parsed.data.action === "create_occasion_levy") {
    const { data } = parsed.data;
    let memberIds: string[] = [];

    if (data.targetScope === "single_member" && data.targetMemberId) {
      const { data: member } = await admin
        .from("profiles")
        .select("id, status, member_number")
        .eq("id", data.targetMemberId)
        .maybeSingle();

      if (!member || member.status !== "active" || !member.member_number) {
        return jsonError("Choose an active registered member.", 404);
      }

      memberIds = [member.id];
    } else {
      const { data: members } = await admin
        .from("profiles")
        .select("id")
        .eq("status", "active")
        .not("member_number", "is", null);

      memberIds = ((members as Array<{ id: string }> | null) ?? []).map(
        (member) => member.id,
      );
    }

    if (memberIds.length === 0) {
      return jsonError("There are no active registered members for this levy.", 409);
    }

    const { data: levy, error: levyError } = await admin
      .from("occasion_levies")
      .insert({
        amount: data.amount,
        created_by: user.id,
        description: data.description || null,
        due_at: data.dueAt ?? null,
        target_member_id:
          data.targetScope === "single_member" ? data.targetMemberId : null,
        target_scope: data.targetScope,
        title: data.title,
      })
      .select("id")
      .single();

    if (levyError || !levy) {
      return jsonError(
        levyError?.message ?? "Unable to create the occasion levy.",
        500,
      );
    }

    const { error: chargesError } = await admin.from("member_charges").insert(
      memberIds.map((memberId) => ({
        amount: data.amount,
        charge_category: "occasion_levy",
        created_by: user.id,
        description: data.description || `Cooperative occasion levy: ${data.title}.`,
        due_at: data.dueAt ?? null,
        member_id: memberId,
        source_id: levy.id,
        source_type: "manual",
        status: "pending",
        title: data.title,
      })),
    );

    if (chargesError) {
      await admin.from("occasion_levies").delete().eq("id", levy.id);
      return jsonError(
        chargesError.message ?? "Unable to assign the occasion levy.",
        500,
      );
    }

    await sendBatchMemberNotifications(
      admin,
      memberIds.map((memberId) => ({
        actionUrl: "/portal",
        contextLabel: `Occasion levy for ${memberId}`,
        memberId,
        message: `${data.title}: ${formatNaira(data.amount)} has been added to your cooperative obligations${data.dueAt ? ` and is due ${new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(data.dueAt))}` : ""}.`,
        title: "New occasion levy",
        type: "due_reminder",
      })),
    );

    revalidateFinanceViews();
    return NextResponse.json({
      message: `Occasion levy assigned to ${memberIds.length.toLocaleString("en-NG")} member${memberIds.length === 1 ? "" : "s"}.`,
    });
  }

  const { data } = parsed.data;
  const { error } = await admin
    .from("member_charges")
    .update({
      resolved_at: data.status === "pending" ? null : new Date().toISOString(),
      status: data.status,
    })
    .eq("id", data.chargeId);

  if (error) {
    return jsonError(error.message ?? "Unable to update the charge status.", 500);
  }

  revalidateFinanceViews();
  return NextResponse.json({ message: "Charge status updated successfully." });
}
