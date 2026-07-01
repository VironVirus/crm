"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BellRing,
  Building2,
  CreditCard,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  UserRound,
  Vote,
  Wallet,
  X,
} from "lucide-react";
import { NotificationBell } from "@/components/portal/notification-bell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getMemberTierMeta, type MemberTier } from "@/lib/member-tier";

type MemberShellProps = {
  children: React.ReactNode;
  memberName: string;
  memberNumber: string | null;
  memberTier: MemberTier;
  userEmail?: string;
  userId: string;
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
  { href: "/portal/profile", icon: UserRound, label: "Profile" },
  { href: "/portal/notifications", icon: BellRing, label: "Alerts" },
  { href: "/portal/governance", icon: Vote, label: "Voting", minimumTier: "tier_2" },
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
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4" />
          <span>{label}</span>
        </div>
        <span className="text-[11px] uppercase tracking-[0.22em] text-amber-200">
          {minimumTier?.replace("_", " ").toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <Link
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
        isActive
          ? "bg-emerald-500/15 text-emerald-100"
          : "text-slate-200 hover:bg-white/[0.06] hover:text-white"
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
  userEmail,
  userId,
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
    () => portalItems.filter((item) => item.href !== "/portal/governance" && item.href !== "/portal/loans"),
    [],
  );

  const groupedItems = useMemo(
    () => [
      {
        title: "Main",
        items: portalItems.filter((item) =>
          ["/portal", "/portal/savings", "/portal/profile", "/portal/notifications"].includes(item.href),
        ),
      },
      {
        title: "More",
        items: portalItems.filter((item) =>
          ["/portal/governance", "/portal/loans"].includes(item.href),
        ),
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.18),_transparent_30%),linear-gradient(180deg,_#05070c,_#0b1220)] text-white">
      <div className="mx-auto min-h-screen max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:px-8">
        <header className="sticky top-4 z-30 mb-6 rounded-[30px] border border-white/15 bg-[#111827]/95 px-5 py-4 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-amber-300 text-slate-950 shadow-lg">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-['Outfit'] text-lg font-semibold text-white">
                  Ifemelumma Cooperative Society
                </p>
                <p className="text-xs uppercase tracking-[0.24em] text-amber-300">
                  {tierMeta.label} · {tierMeta.medal}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <NotificationBell userId={userId} />
              <button
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
                onClick={() => setMenuOpen(true)}
                type="button"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-[26px] border border-white/10 bg-slate-950/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-white">{memberName}</p>
              <p className="mt-1 text-sm text-slate-300">
                {memberNumber ?? "Member number pending"}
              </p>
            </div>
            <div className="max-w-xl text-sm text-slate-200">{tierMeta.nextStep}</div>
          </div>
        </header>

        <main>{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#08111d]/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
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
              pathname.startsWith("/portal/loans") || pathname.startsWith("/portal/governance")
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
                  <p className="font-medium text-white">{memberName}</p>
                  <p className="text-sm text-slate-300">
                    {memberNumber ?? "Member number pending"}
                  </p>
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

            <div className="mt-5 rounded-[26px] border border-emerald-400/15 bg-emerald-500/10 px-4 py-4 text-sm text-slate-100">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-emerald-200">
                <ShieldCheck className="h-4 w-4" />
                {tierMeta.label}
              </div>
              <p className="mt-3 leading-6">{tierMeta.description}</p>
            </div>

            <div className="mt-6 space-y-6">
              {groupedItems.map((group) => (
                <div key={group.title} className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
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
