import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRequiredEnvironmentVariables } from "@/lib/env/requirements";

export default function AdminSettingsPage() {
  const requirements = getRequiredEnvironmentVariables();

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-white/15 bg-[#111827] p-6 shadow-2xl shadow-black/30">
        <Badge className="w-fit">Settings</Badge>
        <h2 className="mt-4 font-['Outfit'] text-3xl font-semibold text-white">
          Deployment settings
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
          This page shows the key environment values the application expects in
          production. Database structure, notifications, and payment providers
          are controlled from your platform settings and Supabase project.
        </p>
      </section>

      <Card className="border-white/15 bg-[#111827]">
        <CardHeader>
          <CardTitle className="font-['Outfit'] text-2xl text-white">
            Required environment variables
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {requirements.required.map((item) => (
            <div
              key={item.name}
              className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-200"
            >
              <p className="font-medium text-white">{item.name}</p>
              <p className="mt-1 text-slate-400">{item.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-white/15 bg-[#111827]">
        <CardHeader>
          <CardTitle className="font-['Outfit'] text-2xl text-white">
            Recommended environment variables
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {requirements.recommended.map((item) => (
            <div
              key={item.name}
              className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-200"
            >
              <p className="font-medium text-white">{item.name}</p>
              <p className="mt-1 text-slate-400">{item.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
