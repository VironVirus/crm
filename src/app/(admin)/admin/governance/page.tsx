import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminGovernancePage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-border bg-card p-5 shadow-2xl shadow-black/10 dark:shadow-black/30 sm:rounded-[32px] sm:p-6">
        <Badge className="w-fit">Governance</Badge>
        <h2 className="mt-4 font-['Outfit'] text-3xl font-semibold text-foreground">
          Governance overview
        </h2>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="font-['Outfit'] text-2xl text-foreground">
            No active governance records yet
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          No resolutions have been published.
        </CardContent>
      </Card>
    </div>
  );
}
