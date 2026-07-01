import "server-only";

import { type createServerSupabaseClient } from "@/lib/supabase/server";

export const COOPERATIVE_ROLES = [
  "admin",
  "loan_officer",
  "treasurer",
  "member",
] as const;

export type CooperativeRole = (typeof COOPERATIVE_ROLES)[number];

export const FINANCIAL_RECORD_ROLES = ["admin", "treasurer"] as const;

export function isCooperativeRole(value: unknown): value is CooperativeRole {
  return (
    typeof value === "string" &&
    COOPERATIVE_ROLES.includes(value as CooperativeRole)
  );
}

export function isFinancialRecordManager(
  role: CooperativeRole | string | null | undefined,
) {
  return role === "admin" || role === "treasurer";
}

export async function getCurrentUserRole(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !isCooperativeRole(data?.role)) {
    return null;
  }

  return data.role;
}
