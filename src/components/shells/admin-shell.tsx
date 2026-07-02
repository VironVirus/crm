"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BarChart3,
  Coins,
  Landmark,
  LayoutDashboard,
  Menu,
  Settings2,
  Vote,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { COOPERATIVE_NAME } from "@/lib/brand";

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
  { href: "/admin/governance", icon: Vote, label: "Meetings" },
  { href: "/admin/shares", icon: Coins, label: "Shares" },
  { href: "/admin/settings", icon: Settings2, label: "Settings" },
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.1),_transparent_30%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)))] text-foreground">
      <div className="mx-auto min-h-screen max-w-7xl px-3 pb-28 pt-3 sm:px-6 sm:pt-4 lg:px-8">
        <header className="sticky top-3 z-30 mb-5 rounded-[24px] border border-border bg-card/95 px-4 py-4 shadow-xl shadow-black/10 backdrop-blur dark:shadow-black/30 sm:top-4 sm:rounded-[30px] sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <BrandMark size="sm" variant="symbol" />
              <div className="min-w-0">
                <p className="max-w-[210px] truncate font-['Outfit'] text-sm font-semibold text-foreground sm:max-w-none sm:text-lg">
                  {COOPERATIVE_NAME}
                </p>
                <p className="text-xs uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">
                  Admin dashboard
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle className="hidden sm:flex" />
              <button
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground transition hover:bg-muted"
                onClick={() => setMenuOpen(true)}
                type="button"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border border-border bg-background/70 px-4 py-4 text-sm text-muted-foreground sm:rounded-[26px]">
            Administration
          </div>
        </header>

        <main>{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 py-2 backdrop-blur sm:px-3 sm:py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                className={`flex min-w-[68px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center text-[11px] font-medium transition ${
                  active
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-100"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
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
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-100"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
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
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm">
          <div className="absolute right-0 top-0 h-full w-full max-w-sm border-l border-border bg-card p-5 text-card-foreground shadow-2xl shadow-black/20 dark:shadow-black/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-100">
                  {initials}
                </div>
                <div>
                  <p className="font-medium text-foreground">{userEmail ?? "Administrator"}</p>
                  <p className="text-sm text-muted-foreground">Administrative access</p>
                </div>
              </div>
              <button
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground"
                onClick={() => setMenuOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 space-y-3">
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
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
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-100"
                          : "text-foreground hover:bg-secondary"
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
              <div className="mt-6 flex justify-end">
                <ThemeToggle />
              </div>
            ) : null}

            <div className="mt-8">
              <SignOutButton
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-medium text-foreground transition hover:bg-muted"
                label="Sign out"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
