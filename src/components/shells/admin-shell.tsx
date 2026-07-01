"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  Coins,
  Landmark,
  LayoutDashboard,
  Menu,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";

type AdminShellProps = {
  children: React.ReactNode;
  userEmail?: string;
};

type NavigationItem = {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
};

const adminItems: NavigationItem[] = [
  { href: "/admin", icon: LayoutDashboard, label: "Home" },
  { href: "/admin/members", icon: Users, label: "Members" },
  { href: "/admin/finance", icon: Wallet, label: "Savings" },
  { href: "/admin/loans", icon: Landmark, label: "Loans" },
  { href: "/admin/reports", icon: BarChart3, label: "Reports" },
  { href: "/admin/shares", icon: Coins, label: "Shares" },
];

function isActivePath(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

export default function AdminShell({ children, userEmail }: AdminShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials =
    userEmail
      ?.split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase())
      .join("") ?? "AD";

  const primaryItems = useMemo(() => adminItems.slice(0, 5), []);
  const moreItems = useMemo(() => adminItems.slice(5), []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.12),_transparent_28%),linear-gradient(180deg,_#05070c,_#0b1220)] text-white">
      <div className="mx-auto min-h-screen max-w-7xl px-4 pb-28 pt-4 sm:px-6 lg:px-8">
        <header className="sticky top-4 z-30 mb-6 rounded-[30px] border border-white/15 bg-[#111827]/95 px-5 py-4 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-amber-300 text-slate-950 shadow-lg">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-['Outfit'] text-lg font-semibold text-white">
                  Ifemelumma Cooperative Society
                </p>
                <p className="text-xs uppercase tracking-[0.24em] text-amber-300">
                  Admin dashboard
                </p>
              </div>
            </div>

            <button
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
              onClick={() => setMenuOpen(true)}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 rounded-[26px] border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-200">
            Manage members, savings, loans, shares, and reports from one place.
          </div>
        </header>

        <main>{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#08111d]/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                className={`flex min-w-[68px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center text-[11px] font-medium transition ${
                  active
                    ? "bg-emerald-500/15 text-emerald-100"
                    : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                }`}
                href={item.href}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <button
            className={`flex min-w-[68px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center text-[11px] font-medium transition ${
              pathname.startsWith("/admin/shares")
                ? "bg-emerald-500/15 text-emerald-100"
                : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
            }`}
            onClick={() => setMenuOpen(true)}
            type="button"
          >
            <Menu className="h-5 w-5" />
            <span>Menu</span>
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm">
          <div className="absolute right-0 top-0 h-full w-full max-w-sm border-l border-white/10 bg-[#0b1220] p-5 shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 font-semibold text-emerald-100">
                  {initials}
                </div>
                <div>
                  <p className="font-medium text-white">{userEmail ?? "Administrator"}</p>
                  <p className="text-sm text-slate-300">Administrative access</p>
                </div>
              </div>
              <button
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white"
                onClick={() => setMenuOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 space-y-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Navigation
              </p>
              <div className="space-y-2">
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActivePath(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                        active
                          ? "bg-emerald-500/15 text-emerald-100"
                          : "text-slate-200 hover:bg-white/[0.06] hover:text-white"
                      }`}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {moreItems.length > 0 ? (
              <div className="mt-6 rounded-[26px] border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-200">
                Additional sections stay grouped here so the main dashboard
                navigation remains clean on both desktop and mobile.
              </div>
            ) : null}

            <div className="mt-8">
              <SignOutButton
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                label="Sign out"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
