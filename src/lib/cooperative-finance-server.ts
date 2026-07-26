import "server-only";

import { getCurrentMonthStart } from "@/lib/cooperative-finance";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function ensureCurrentMonthlyDues(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  triggeredBy?: string | null,
) {
  const { error } = await admin.rpc("generate_monthly_member_dues", {
    requested_period: getCurrentMonthStart(),
    triggered_by: triggeredBy ?? null,
  });

  return error?.message ?? null;
}
