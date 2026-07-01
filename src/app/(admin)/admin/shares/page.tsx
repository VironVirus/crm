import AdminSharesPageView from "@/features/admin/shares/page-view";
import {
  parseSupabaseNumeric,
  type DividendDeclarationRow,
  type ShareConfig,
  type ShareMemberOption,
  type ShareRegisterRow,
} from "@/lib/shares";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

type MemberSharesRecord = {
  member_id: string;
  total_shares: number | string | null;
  total_value: number | string | null;
  last_updated: string;
};

type ShareConfigRecord = {
  share_value: number | string | null;
  minimum_shares: number;
  created_at: string;
};

type DividendDeclarationRecord = {
  id: string;
  financial_year: string;
  total_profit: number | string | null;
  dividend_per_share: number | string | null;
  declaration_date: string;
  payment_date: string | null;
  status: DividendDeclarationRow["status"];
  declared_by: string;
};

type DividendPaymentRecord = {
  dividend_declaration_id: string;
};

export default async function AdminSharesPage() {
  const admin = createSupabaseAdminClient();

  const [
    membersResult,
    profilesResult,
    memberSharesResult,
    shareConfigResult,
    dividendDeclarationsResult,
    dividendPaymentsResult,
  ] = await Promise.all([
    admin.from("members").select("id"),
    admin
      .from("profiles")
      .select("id, full_name, email, phone, member_number")
      .order("full_name"),
    admin
      .from("member_shares")
      .select("member_id, total_shares, total_value, last_updated"),
    admin
      .from("share_config")
      .select("share_value, minimum_shares, created_at")
      .limit(1)
      .maybeSingle(),
    admin
      .from("dividend_declarations")
      .select(
        "id, financial_year, total_profit, dividend_per_share, declaration_date, payment_date, status, declared_by",
      )
      .order("declaration_date", { ascending: false }),
    admin.from("dividend_payments").select("dividend_declaration_id"),
  ]);

  const errors = [
    membersResult.error?.message,
    profilesResult.error?.message,
    memberSharesResult.error?.message,
    shareConfigResult.error?.message,
    dividendDeclarationsResult.error?.message,
    dividendPaymentsResult.error?.message,
  ].filter(Boolean);

  const memberIds = new Set(
    ((membersResult.data as MemberRecord[] | null) ?? []).map((member) => member.id),
  );
  const allProfiles = (profilesResult.data as ProfileRecord[] | null) ?? [];
  const profiles = allProfiles.filter((profile) => memberIds.has(profile.id));
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const allProfilesMap = new Map(
    allProfiles.map((profile) => [profile.id, profile]),
  );

  const memberSharesMap = new Map(
    (((memberSharesResult.data as MemberSharesRecord[] | null) ?? []).map((record) => [
      record.member_id,
      record,
    ])) satisfies Array<[string, MemberSharesRecord]>,
  );

  const register: ShareRegisterRow[] = profiles
    .map((profile) => {
      const holdings = memberSharesMap.get(profile.id);

      return {
        memberId: profile.id,
        memberName: profile.full_name,
        memberNumber: profile.member_number,
        memberEmail: profile.email,
        memberPhone: profile.phone,
        totalShares: parseSupabaseNumeric(holdings?.total_shares),
        totalValue: parseSupabaseNumeric(holdings?.total_value),
        lastUpdated: holdings?.last_updated ?? "",
      } satisfies ShareRegisterRow;
    })
    .sort((left, right) => left.memberName.localeCompare(right.memberName));

  const members: ShareMemberOption[] = register.map((row) => ({
    id: row.memberId,
    fullName: row.memberName,
    memberNumber: row.memberNumber,
    email: row.memberEmail,
    phone: row.memberPhone,
    totalShares: row.totalShares,
    totalValue: row.totalValue,
  }));

  const paymentCounts = ((dividendPaymentsResult.data as DividendPaymentRecord[] | null) ?? []).reduce(
    (map, payment) => {
      map.set(
        payment.dividend_declaration_id,
        (map.get(payment.dividend_declaration_id) ?? 0) + 1,
      );
      return map;
    },
    new Map<string, number>(),
  );

  const declarations: DividendDeclarationRow[] = (
    (dividendDeclarationsResult.data as DividendDeclarationRecord[] | null) ?? []
  ).map((record) => ({
    id: record.id,
    financialYear: record.financial_year,
    totalProfit: parseSupabaseNumeric(record.total_profit),
    dividendPerShare: parseSupabaseNumeric(record.dividend_per_share),
    declarationDate: record.declaration_date,
    paymentDate: record.payment_date,
    status: record.status,
    declaredByName:
      allProfilesMap.get(record.declared_by)?.full_name ?? "Administrator",
    paymentCount: paymentCounts.get(record.id) ?? 0,
  }));

  const shareConfig = shareConfigResult.data
    ? ({
        shareValue: parseSupabaseNumeric(
          (shareConfigResult.data as ShareConfigRecord).share_value,
        ),
        minimumShares: (shareConfigResult.data as ShareConfigRecord).minimum_shares,
        createdAt: (shareConfigResult.data as ShareConfigRecord).created_at,
      } satisfies ShareConfig)
    : null;

  return (
    <AdminSharesPageView
      config={shareConfig}
      dataError={errors.length > 0 ? errors.join(" ") : null}
      declarations={declarations}
      members={members}
      register={register}
    />
  );
}
