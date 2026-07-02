import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { shareConfigUpdateSchema } from "@/lib/validation/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function PATCH(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Unable to read the share configuration.", 400);
  }

  const parsed = shareConfigUpdateSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please review the share configuration and try again.",
      400,
    );
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("You need to sign in before updating share setup.", 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return jsonError("Only administrators can update share setup.", 403);
  }

  const { error } = await admin.from("share_config").upsert({
    id: true,
    minimum_shares: parsed.data.minimumShares,
    share_value: parsed.data.shareValue,
  });

  if (error) {
    return jsonError(
      error.message ?? "Unable to update the share configuration.",
      500,
    );
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/shares");
  revalidatePath("/portal/financials");

  return NextResponse.json({
    message: "Share configuration updated successfully.",
  });
}
