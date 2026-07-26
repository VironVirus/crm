import AdminSavingsPageView from "@/features/admin/finance/page-view";
import {
  parseSupabaseNumeric,
  sortSavingsAccountsByType,
  type SavingsAccountOption,
  type SavingsAccountRow,
  type SavingsMemberOption,
} from "@/lib/savings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ProfileRecord = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  member_number: string | null;
};

type MemberRecord = {
  id: string;
};

type SavingsAccountRecord = {
  id: string;
  member_id: string;
  account_type: SavingsAccountRow["accountType"];
  balance: number | string | null;
  interest_rate: number | string | null;
  maturity_date: string | null;
  status: SavingsAccountRow["status"];
  created_at: string;
};

export default async function AdminFinancePage() {
  const supabase = await createServerSupabaseClient();

  const [membersResult, profilesResult, accountsResult] = await Promise.all([
    supabase.from("members").select("id"),
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, member_number")
      .order("full_name"),
    supabase
      .from("savings_accounts")
      .select(
        "id, member_id, account_type, balance, interest_rate, maturity_date, status, created_at",
      )
      .order("created_at", { ascending: false }),
  ]);

  const errors = [
    membersResult.error?.message,
    profilesResult.error?.message,
    accountsResult.error?.message,
  ].filter(Boolean);

  const memberIds = new Set((membersResult.data as MemberRecord[] | null)?.map((member) => member.id) ?? []);
  const profiles = (profilesResult.data as ProfileRecord[] | null) ?? [];
  const profileMap = new Map<string, ProfileRecord>(
    profiles
      .filter((profile) => memberIds.has(profile.id))
      .map((profile) => [profile.id, profile]),
  );

  const accounts = ((accountsResult.data as SavingsAccountRecord[] | null) ?? []).map(
    (account) => {
      const profile = profileMap.get(account.member_id);

      return {
        id: account.id,
        memberId: account.member_id,
        memberName: profile?.full_name ?? "Registered member",
        memberNumber: profile?.member_number ?? null,
        memberEmail: profile?.email ?? "No email on file",
        memberPhone: profile?.phone ?? null,
        accountType: account.account_type,
        balance: parseSupabaseNumeric(account.balance),
        interestRate: parseSupabaseNumeric(account.interest_rate),
        maturityDate: account.maturity_date,
        status: account.status,
        createdAt: account.created_at,
      } satisfies SavingsAccountRow;
    },
  );

  const memberAccountsMap = new Map<string, SavingsAccountOption[]>();

  accounts.forEach((account) => {
    const memberAccounts = memberAccountsMap.get(account.memberId) ?? [];

    memberAccounts.push({
      id: account.id,
      accountType: account.accountType,
      balance: account.balance,
      interestRate: account.interestRate,
      maturityDate: account.maturityDate,
      status: account.status,
      createdAt: account.createdAt,
    });

    memberAccountsMap.set(account.memberId, memberAccounts);
  });

  const members: SavingsMemberOption[] = Array.from(memberIds)
    .map((memberId) => {
      const profile = profileMap.get(memberId);

      if (!profile) {
        return null;
      }

      return {
        id: memberId,
        fullName: profile.full_name,
        memberNumber: profile.member_number,
        email: profile.email,
        phone: profile.phone,
        accounts: sortSavingsAccountsByType(memberAccountsMap.get(memberId) ?? []),
      } satisfies SavingsMemberOption;
    })
    .filter((member): member is SavingsMemberOption => Boolean(member))
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  return (
    <AdminSavingsPageView
      accounts={accounts}
      dataError={errors.length > 0 ? errors.join(" ") : null}
      members={members}
    />
  );
}
