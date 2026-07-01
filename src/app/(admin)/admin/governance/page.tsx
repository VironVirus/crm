import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminGovernancePage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-white/15 bg-[#111827] p-6 shadow-2xl shadow-black/30">
        <Badge className="w-fit">Governance</Badge>
        <h2 className="mt-4 font-['Outfit'] text-3xl font-semibold text-white">
          Governance overview
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
          Member voting will appear here as soon as active resolutions and
          meeting records are published into the system.
        </p>
      </section>

      <Card className="border-white/15 bg-[#111827]">
        <CardHeader>
          <CardTitle className="font-['Outfit'] text-2xl text-white">
            No active governance records yet
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-slate-200">
          This area is ready for live governance data. Once records are added,
          administrators will be able to review what members are seeing in the
          portal.
        </CardContent>
      </Card>
    </div>
  );
}
