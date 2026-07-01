import { MemberRegistrationForm } from "@/components/auth/member-registration-form";

export default function RegisterPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.24),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.18),_transparent_30%),linear-gradient(180deg,_#06080d,_#0b1120)] px-6 py-10 text-white">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:96px_96px] opacity-30" />
      <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
        <section className="space-y-8">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Structured cooperative member onboarding
          </div>
          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-amber-300">
              Ifemelumma Cooperative Society
            </p>
            <h1 className="max-w-2xl font-['Outfit'] text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Register members with verified identity, secure storage, and a
              generated cooperative number.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-300">
              Capture personal details, next-of-kin information, KYC documents,
              and auth credentials in one guided flow that feeds directly into
              Supabase.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              "Profiles and members records stay in sync",
              "Private KYC files land in Supabase Storage",
              "Each successful registration receives a member number",
            ].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200 shadow-2xl backdrop-blur"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <MemberRegistrationForm />
      </div>
    </main>
  );
}
