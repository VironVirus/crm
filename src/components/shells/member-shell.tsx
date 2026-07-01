"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  Building2,
  CreditCard,
  Landmark,
  LayoutDashboard,
  ShieldCheck,
  Vote,
} from "lucide-react";
import { NotificationBell } from "@/components/portal/notification-bell";
import { SignOutButton } from "@/components/auth/sign-out-button";

const portalLinks = [
  { href: "/portal", label: "Overview", icon: LayoutDashboard },
  { href: "/portal/savings", label: "Savings", icon: CreditCard },
  { href: "/portal/loans", label: "Loans", icon: Landmark },
  { href: "/portal/governance", label: "Governance", icon: Vote },
  { href: "/portal/notifications", label: "Notifications", icon: BellRing },
];

export default function MemberShell({
  children,
  userId,
  userEmail,
}: {
  children: React.ReactNode;
  userId: string;
  userEmail?: string;
}) {
  const pathname = usePathname();
  const initials =
    userEmail
      ?.split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase())
      .join("") ?? "MB";

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#05070c,_#0b1220)] text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:flex-row lg:gap-6 lg:px-8">
        <aside className="mb-4 rounded-[28px] border border-white/15 bg-[#111827] p-5 shadow-xl shadow-black/30 lg:mb-0 lg:w-80">
          <div className="flex items-center gap-4 border-b border-white/15 pb-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-amber-300 text-slate-950 shadow-lg">
              <Building2 size={22} />
            </div>
            <div>
              <p className="font-['Outfit'] text-xl font-semibold text-white">
                Ifemelumma
              </p>
              <p className="text-xs uppercase tracking-[0.28em] text-amber-300">
                Member Portal
              </p>
            </div>
          </div>

          <nav className="mt-6 space-y-2">
            {portalLinks.map((link) => {
              const Icon = link.icon;
              const isActive =
                link.href === "/portal"
                  ? pathname === link.href
                  : pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    isActive
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "text-slate-200 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-3xl border border-emerald-400/20 bg-emerald-500/15 p-4 text-sm text-slate-100">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 font-semibold text-white">
                {initials}
              </div>
              <div>
                <p className="font-medium text-white">{userEmail ?? "Member"}</p>
                <p className="text-xs text-slate-300">Authenticated session</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-emerald-200">
              <ShieldCheck size={14} />
              Protected access
            </div>
            <SignOutButton
              className="mt-4 flex w-full items-center justify-center rounded-2xl border border-white/15 bg-slate-900/90 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              label="Sign out"
            />
          </div>
        </aside>

        <div className="flex-1">
          <header className="mb-4 flex flex-col gap-4 rounded-[28px] border border-white/15 bg-[#111827] px-5 py-5 shadow-xl shadow-black/30 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-amber-300">
                Ifemelumma Cooperative Society
              </p>
              <h1 className="mt-2 font-['Outfit'] text-3xl font-semibold text-white">
                Member self-service workspace
              </h1>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-200">
              Track contributions, follow resolutions, and stay close to the
              society&apos;s day-to-day operations.
            </p>
            <div className="sm:self-start">
              <NotificationBell userId={userId} />
            </div>
          </header>

          <main className="pb-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
