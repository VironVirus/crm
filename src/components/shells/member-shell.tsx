"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CreditCard,
  LineChart,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  ShieldCheck,
  UserRound,
  Vote,
  Wallet,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { COOPERATIVE_NAME } from "@/lib/brand";
import { getMemberTierMeta, type MemberTier } from "@/lib/member-tier";

type MemberShellProps = {
  children: React.ReactNode;
  memberName: string;
  memberNumber: string | null;
  memberTier: MemberTier;
  memberVerified?: boolean;
  userAvatarUrl?: string | null;
  userEmail?: string;
};

type NavigationItem = {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  minimumTier?: MemberTier;
};

const portalItems: NavigationItem[] = [
  { href: "/portal", icon: LayoutDashboard, label: "Home" },
  { href: "/portal/savings", icon: CreditCard, label: "Savings" },
  { href: "/portal/actions", icon: LayoutGrid, label: "Actions" },
  { href: "/portal/financials", icon: LineChart, label: "Financials" },
  { href: "/portal/profile", icon: UserRound, label: "Profile" },
  { href: "/portal/notifications", icon: ShieldCheck, label: "Alerts" },
  { href: "/portal/governance", icon: Vote, label: "Meetings" },
  { href: "/portal/loans", icon: Wallet, label: "Loans", minimumTier: "tier_3" },
];

function tierRank(tier: MemberTier) {
  switch (tier) {
    case "tier_3":
      return 3;
    case "tier_2":
      return 2;
    case "tier_1":
    default:
      return 1;
  }
}

function canAccess(memberTier: MemberTier, minimumTier?: MemberTier) {
  if (!minimumTier) {
    return true;
  }

  return tierRank(memberTier) >= tierRank(minimumTier);
}

function isActivePath(pathname: string, href: string) {
  return href === "/portal" ? pathname === href : pathname.startsWith(href);
}

function NavigationLink({
  href,
  icon: Icon,
  isActive,
  isLocked,
  label,
  minimumTier,
  onClick,
}: NavigationItem & {
  isActive: boolean;
  isLocked: boolean;
  onClick?: () => void;
}) {
  if (isLocked) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4" />
          <span>{label}</span>
        </div>
        <span className="text-[11px] uppercase tracking-[0.22em] text-amber-800 dark:text-amber-200">
          {minimumTier?.replace("_", " ").toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <Link
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
        isActive
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-100"
          : "text-foreground hover:bg-secondary"
      }`}
      href={href}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}

export default function MemberShell({
  children,
  memberName,
  memberNumber,
  memberTier,
  memberVerified = false,
  userAvatarUrl,
  userEmail,
}: MemberShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const tierMeta = getMemberTierMeta(memberTier);
  const initials =
    userEmail
      ?.split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase())
      .join("") ?? "MB";

  const primaryItems = useMemo(
    () =>
      portalItems.filter((item) =>
        ["/portal", "/portal/savings", "/portal/actions", "/portal/profile"].includes(
          item.href,
        ),
      ),
    [],
  );

  const groupedItems = useMemo(
    () => [
      {
        title: "Main",
        items: portalItems.filter((item) =>
          [
            "/portal",
            "/portal/savings",
            "/portal/actions",
            "/portal/profile",
          ].includes(item.href),
        ),
      },
      {
        title: "More",
        items: portalItems.filter((item) =>
          ["/portal/financials", "/portal/notifications", "/portal/governance", "/portal/loans"].includes(
            item.href,
          ),
        ),
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.12),_transparent_32%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)))] text-foreground">
      <div
        className="mx-auto min-h-screen max-w-6xl px-3 pt-3 sm:px-6 sm:pt-4 lg:px-8"
        style={{ paddingBottom: "calc(8rem + env(safe-area-inset-bottom))" }}
      >
        <header className="sticky top-3 z-30 mb-5 rounded-[24px] border border-border bg-card/95 px-4 py-4 shadow-xl shadow-black/10 backdrop-blur dark:shadow-black/30 sm:top-4 sm:rounded-[30px] sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <BrandMark size="sm" variant="symbol" />
              <div className="min-w-0">
                <p className="max-w-[210px] truncate font-['Outfit'] text-sm font-semibold text-foreground sm:max-w-none sm:text-lg">
                  {COOPERATIVE_NAME}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground transition hover:bg-muted"
                onClick={() => setMenuOpen(true)}
                type="button"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <main>{children}</main>
      </div>

      <nav
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 text-slate-100 sm:px-4"
        style={{ paddingBottom: "calc(0.85rem + env(safe-area-inset-bottom))" }}
      >
        <div className="pointer-events-auto mx-auto flex max-w-3xl items-center justify-between gap-2 rounded-[28px] border border-white/10 bg-slate-950/96 px-2 py-2 shadow-[0_22px_44px_rgba(2,6,23,0.52)] backdrop-blur-xl">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                className={`flex min-h-[58px] min-w-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center text-[11px] font-semibold transition ${
                  active
                    ? "bg-emerald-500/22 text-white"
                    : "text-slate-300 hover:bg-white/8 hover:text-white"
                }`}
                href={item.href}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <button
            className={`flex min-h-[58px] min-w-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center text-[11px] font-semibold transition ${
              pathname.startsWith("/portal/loans") ||
              pathname.startsWith("/portal/governance") ||
              pathname.startsWith("/portal/notifications")
                ? "bg-emerald-500/22 text-white"
                : "text-slate-300 hover:bg-white/8 hover:text-white"
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
                {userAvatarUrl ? (
                  <img
                    alt={`${memberName} passport`}
                    className="h-11 w-11 rounded-full border border-border object-cover"
                    src={userAvatarUrl}
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 font-semibold text-emerald-100">
                    {initials}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{memberName}</p>
                    {memberVerified ? (
                      <span className="rounded-full border border-sky-300/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-100">
                        Verified
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {memberNumber ?? "Member number pending"}
                  </p>
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

            <div className="mt-5 rounded-[26px] border border-emerald-400/15 bg-emerald-500/10 px-4 py-4 text-sm text-foreground">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-100">
                <ShieldCheck className="h-4 w-4" />
                {tierMeta.label}
              </div>
              <p className="mt-3 leading-6">{tierMeta.nextStep}</p>
            </div>

            <div className="mt-6 space-y-6">
              {groupedItems.map((group) => (
                <div key={group.title} className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    {group.title}
                  </p>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <NavigationLink
                        key={item.href}
                        {...item}
                        isActive={isActivePath(pathname, item.href)}
                        isLocked={!canAccess(memberTier, item.minimumTier)}
                        onClick={() => setMenuOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <ThemeToggle />
            </div>

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
