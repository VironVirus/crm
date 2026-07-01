import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMemberTier, getMemberTierMeta } from "@/lib/member-tier";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type MemberRecord = {
  national_id_path: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  passport_photo_path: string | null;
  utility_bill_path: string | null;
};

export default async function PortalGovernancePage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/portal/governance");
  }

  const { data: member } = await supabase
    .from("members")
    .select(
      "next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, national_id_path, passport_photo_path, utility_bill_path",
    )
    .eq("id", user.id)
    .maybeSingle();

  const tier = getMemberTier(member as MemberRecord | null);
  const tierMeta = getMemberTierMeta(tier);

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-white/15 bg-[#111827] p-6 shadow-2xl shadow-black/30">
        <Badge className="w-fit">{tierMeta.label}</Badge>
        <h2 className="mt-4 font-['Outfit'] text-3xl font-semibold text-white">
          Governance and voting
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
          {tierMeta.canVote
            ? "You can take part in society voting from this page whenever active resolutions are published."
            : "Voting unlocks after you add your next of kin from your profile."}
        </p>
      </section>

      {tierMeta.canVote ? (
        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <CardTitle className="font-['Outfit'] text-2xl text-white">
              No active votes right now
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-slate-200">
            New resolutions and meeting notices will appear here when the
            cooperative publishes them.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-300/20 bg-amber-400/10">
          <CardHeader>
            <CardTitle className="font-['Outfit'] text-2xl text-white">
              Upgrade to Tier 2
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm leading-6 text-amber-100/90 sm:flex-row sm:items-center sm:justify-between">
            <p>Add your next of kin to unlock voting and cooperative governance access.</p>
            <Button asChild>
              <Link href="/portal/profile">Open Profile</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
