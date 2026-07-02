import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const MEMBER_PLACEHOLDER_ADDRESS = "__pending_member_address__";
export const MEMBER_PLACEHOLDER_DATE_OF_BIRTH = "1900-01-01";
export const MEMBER_PLACEHOLDER_OCCUPATION = "__pending_member_occupation__";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export function normalizeMemberText(
  value: string | null | undefined,
  placeholder: string,
) {
  if (!value || value === placeholder) {
    return "";
  }

  return value;
}

export function normalizeMemberDate(value: string | null | undefined) {
  if (!value || value === MEMBER_PLACEHOLDER_DATE_OF_BIRTH) {
    return "";
  }

  return value;
}

export async function ensureMemberRecord(
  admin: AdminClient,
  {
    memberId,
    memberNumber,
    select,
  }: {
    memberId: string;
    memberNumber?: string | null;
    select: string;
  },
) {
  const existing = await admin
    .from("members")
    .select(select)
    .eq("id", memberId)
    .maybeSingle();

  if (existing.data) {
    return existing;
  }

  return admin
    .from("members")
    .upsert(
      {
        id: memberId,
        address: MEMBER_PLACEHOLDER_ADDRESS,
        date_of_birth: MEMBER_PLACEHOLDER_DATE_OF_BIRTH,
        occupation: MEMBER_PLACEHOLDER_OCCUPATION,
        onboarding_status: memberNumber ? "registered" : "pending",
      },
      {
        onConflict: "id",
      },
    )
    .select(select)
    .single();
}
