import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNaira } from "@/lib/loans";
import { getMemberTier } from "@/lib/member-tier";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ProfileRecord = {
  email: string;
  full_name: string;
  id: string;
  member_number: string | null;
  phone: string | null;
  status: "active" | "inactive" | "suspended";
};

type MemberRecord = {
  created_at: string;
  id: string;
  national_id_path: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

type SavingsAccountRecord = {
  balance: number | string | null;
  member_id: string;
};

type ShareHoldingRecord = {
  member_id: string;
  total_value: number | string | null;
};

function parseMoney(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminMembersPage() {
  const admin = createSupabaseAdminClient();
  const [profilesResult, membersResult, savingsResult, sharesResult] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, email, phone, member_number, status")
      .eq("role", "member")
      .order("created_at", { ascending: false }),
    admin
      .from("members")
      .select(
        "id, created_at, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
      ),
    admin
      .from("savings_accounts")
      .select("member_id, balance")
      .eq("status", "active"),
    admin.from("member_shares").select("member_id, total_value"),
  ]);

  const profiles = (profilesResult.data as ProfileRecord[] | null) ?? [];
  const members = new Map(
    (((membersResult.data as MemberRecord[] | null) ?? []).map((member) => [
      member.id,
      member,
    ])) satisfies Array<[string, MemberRecord]>,
  );

  const savingsByMember = new Map<string, number>();
  ((savingsResult.data as SavingsAccountRecord[] | null) ?? []).forEach((account) => {
    savingsByMember.set(
      account.member_id,
      (savingsByMember.get(account.member_id) ?? 0) + parseMoney(account.balance),
    );
  });

  const sharesByMember = new Map<string, number>();
  ((sharesResult.data as ShareHoldingRecord[] | null) ?? []).forEach((holding) => {
    sharesByMember.set(holding.member_id, parseMoney(holding.total_value));
  });

  const rows = profiles.map((profile) => {
    const member = members.get(profile.id) ?? null;
    const tier = getMemberTier(member);

    return {
      email: profile.email,
      fullName: profile.full_name,
      joinedAt: member?.created_at ?? "",
      memberNumber: profile.member_number,
      phone: profile.phone,
      savingsBalance: savingsByMember.get(profile.id) ?? 0,
      sharesValue: sharesByMember.get(profile.id) ?? 0,
      status: profile.status,
      tier,
    };
  });

  const totals = rows.reduce(
    (accumulator, row) => {
      accumulator.members += 1;
      accumulator.savings += row.savingsBalance;
      accumulator.shares += row.sharesValue;
      if (row.status === "active") {
        accumulator.active += 1;
      }
      return accumulator;
    },
    { active: 0, members: 0, savings: 0, shares: 0 },
  );

  const errors = [
    profilesResult.error?.message,
    membersResult.error?.message,
    savingsResult.error?.message,
    sharesResult.error?.message,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-white/15 bg-[#111827] p-6 shadow-2xl shadow-black/30">
        <Badge className="w-fit">Members</Badge>
        <h2 className="mt-4 font-['Outfit'] text-3xl font-semibold text-white">
          Member directory
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
          View registered members, their tiers, and their financial standing in
          one place.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <CardDescription>Total members</CardDescription>
            <CardTitle className="font-['Outfit'] text-3xl text-white">
              {totals.members}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <CardDescription>Active members</CardDescription>
            <CardTitle className="font-['Outfit'] text-3xl text-white">
              {totals.active}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <CardDescription>Total savings</CardDescription>
            <CardTitle className="font-['Outfit'] text-3xl text-white">
              {formatNaira(totals.savings)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <CardDescription>Total shares value</CardDescription>
            <CardTitle className="font-['Outfit'] text-3xl text-white">
              {formatNaira(totals.shares)}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      {errors.length > 0 ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {errors.join(" ")}
        </div>
      ) : null}

      <Card className="border-white/15 bg-[#111827]">
        <CardHeader>
          <CardTitle className="font-['Outfit'] text-2xl text-white">
            Registered members
          </CardTitle>
          <CardDescription className="text-slate-200">
            Only live member records are shown here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-3xl border border-white/15">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Savings</TableHead>
                  <TableHead>Shares</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <TableRow key={`${row.email}-${row.memberNumber ?? "pending"}`}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium text-white">{row.fullName}</p>
                          <p className="text-xs text-slate-400">
                            {row.memberNumber ?? "Member number pending"} · {row.email}
                          </p>
                          <p className="text-xs text-slate-500">
                            {row.phone ?? "No phone on file"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.tier.replace("_", " ").toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            row.status === "active"
                              ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                              : row.status === "suspended"
                                ? "border-rose-400/20 bg-rose-500/10 text-rose-100"
                                : "border-amber-300/20 bg-amber-400/10 text-amber-100"
                          }
                          variant="outline"
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatNaira(row.savingsBalance)}</TableCell>
                      <TableCell>{formatNaira(row.sharesValue)}</TableCell>
                      <TableCell>{row.joinedAt ? formatDate(row.joinedAt) : "Not set"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="text-slate-300" colSpan={6}>
                      No member records have been created yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
