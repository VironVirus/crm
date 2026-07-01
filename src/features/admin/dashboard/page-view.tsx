"use client";

import Link from "next/link";
import {
  type ComponentType,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Coins,
  CreditCard,
  FileText,
  Landmark,
  Loader2,
  PiggyBank,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type DashboardKpiSnapshot,
  type DashboardLoanStatusPoint,
  type DashboardMemberGrowthPoint,
  type DashboardMonthlyComparisonPoint,
  type DashboardRecentActivityItem,
  type DashboardRecentActivitySource,
  formatDashboardCompactNaira,
  formatDashboardDateTime,
  formatDashboardNaira,
  formatDashboardRelativeTime,
} from "@/lib/dashboard";
import { loadRecentDashboardActivity } from "@/lib/dashboard/activity";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type AdminDashboardPageViewProps = {
  dataError?: string | null;
  initialRecentActivity: DashboardRecentActivityItem[];
  kpis: DashboardKpiSnapshot;
  loanStatusDistribution: DashboardLoanStatusPoint[];
  memberGrowth: DashboardMemberGrowthPoint[];
  monthlySavingsVsLoanDisbursements: DashboardMonthlyComparisonPoint[];
};

function formatSignedAmount(value: number) {
  return `${value < 0 ? "-" : "+"}${formatDashboardNaira(Math.abs(value))}`;
}

function getActivityAccent(source: DashboardRecentActivitySource) {
  switch (source) {
    case "loans":
      return "border-amber-300/25 bg-amber-400/15 text-amber-100";
    case "shares":
      return "border-sky-300/25 bg-sky-400/15 text-sky-100";
    case "savings":
    default:
      return "border-emerald-400/25 bg-emerald-500/15 text-emerald-100";
  }
}

function getActivityIcon(source: DashboardRecentActivitySource) {
  switch (source) {
    case "loans":
      return Landmark;
    case "shares":
      return Coins;
    case "savings":
    default:
      return PiggyBank;
  }
}

function DashboardKpiCard({
  accent,
  description,
  icon: Icon,
  label,
  value,
}: {
  accent?: "danger" | "default";
  description: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  const danger = accent === "danger";

  return (
    <Card
      className={
        danger
          ? "border-rose-400/25 bg-rose-500/15"
          : "border-white/15 bg-[#111827]"
      }
    >
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Badge className="w-fit" variant={danger ? "outline" : "secondary"}>
            {label}
          </Badge>
          <div
            className={
              danger
                ? "flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-500/15 text-rose-100"
                : "flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/15 text-emerald-100"
            }
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="space-y-2">
          <CardTitle className="font-['Outfit'] text-3xl text-white">
            {value}
          </CardTitle>
          <CardDescription
            className={danger ? "text-rose-100/85" : "text-slate-200"}
          >
            {description}
          </CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}

export default function AdminDashboardPageView({
  dataError,
  initialRecentActivity,
  kpis,
  loanStatusDistribution,
  memberGrowth,
  monthlySavingsVsLoanDisbursements,
}: AdminDashboardPageViewProps) {
  const [recentActivity, setRecentActivity] = useState(initialRecentActivity);
  const [isRefreshingActivity, setIsRefreshingActivity] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const supabaseRef = useRef(createBrowserSupabaseClient());

  useEffect(() => {
    setRecentActivity(initialRecentActivity);
  }, [initialRecentActivity]);

  useEffect(() => {
    let isActive = true;

    async function refreshRecentActivity() {
      setIsRefreshingActivity(true);

      const result = await loadRecentDashboardActivity(supabaseRef.current);

      if (!isActive) {
        return;
      }

      if (result.error) {
        setActivityError(result.error);
      } else {
        setActivityError(null);
        setRecentActivity(result.items);
      }

      setIsRefreshingActivity(false);
    }

    const channel = supabaseRef.current
      .channel("admin-dashboard-recent-activity")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "savings_transactions",
        },
        () => {
          void refreshRecentActivity();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "loan_transactions",
        },
        () => {
          void refreshRecentActivity();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "share_transactions",
        },
        () => {
          void refreshRecentActivity();
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      void supabaseRef.current.removeChannel(channel);
    };
  }, []);

  const totalLoansTracked = useMemo(
    () =>
      loanStatusDistribution.reduce((total, point) => total + point.value, 0),
    [loanStatusDistribution],
  );
  const joinedMembersLastTwelveMonths = useMemo(
    () =>
      memberGrowth.reduce((total, point) => total + point.membersJoined, 0),
    [memberGrowth],
  );
  const hasLoanStatusData = loanStatusDistribution.some(
    (point) => point.value > 0,
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[32px] border border-white/15 bg-[#111827] p-6 shadow-2xl shadow-black/30 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-3">
          <Badge className="w-fit">Admin Overview</Badge>
          <div className="space-y-2">
            <h2 className="font-['Outfit'] text-3xl font-semibold text-white">
              Cooperative performance at a glance
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-200">
              Track member strength, capital movement, lending exposure, and live
              transactions from one command center built for Ifemelumma
              Cooperative Society.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[28px] border border-amber-300/25 bg-amber-400/15 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-200">
              Pending loan reviews
            </p>
            <p className="mt-2 font-['Outfit'] text-3xl font-semibold text-white">
              {kpis.pendingLoanReviewCount}
            </p>
            <p className="mt-1 text-sm text-slate-200">
              Applications still waiting for admin action
            </p>
          </div>
          <div className="rounded-[28px] border border-emerald-400/25 bg-emerald-500/15 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-200">
              Collections this month
            </p>
            <p className="mt-2 font-['Outfit'] text-3xl font-semibold text-white">
              {formatDashboardNaira(kpis.collectionsThisMonth)}
            </p>
            <p className="mt-1 text-sm text-slate-200">
              Savings, repayments, and share purchases combined
            </p>
          </div>
        </div>
      </section>

      {dataError ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {dataError}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DashboardKpiCard
          description="Registered members currently marked active."
          icon={Users}
          label="Total active members"
          value={kpis.totalActiveMembers.toLocaleString("en-NG")}
        />
        <DashboardKpiCard
          description="Combined balance across every savings account."
          icon={PiggyBank}
          label="Total savings balance"
          value={formatDashboardNaira(kpis.totalSavingsBalance)}
        />
        <DashboardKpiCard
          description="Outstanding principal still sitting in the loan book."
          icon={Landmark}
          label="Total loans outstanding"
          value={formatDashboardNaira(kpis.totalLoansOutstanding)}
        />
        <DashboardKpiCard
          description="Current value of issued member share holdings."
          icon={Coins}
          label="Total share capital"
          value={formatDashboardNaira(kpis.totalSharesCapital)}
        />
        <DashboardKpiCard
          description="Cash collected during the current month."
          icon={Wallet}
          label="Collections this month"
          value={formatDashboardNaira(kpis.collectionsThisMonth)}
        />
        <DashboardKpiCard
          accent={kpis.overdueLoansCount > 0 ? "danger" : "default"}
          description={
            kpis.overdueLoansCount > 0
              ? "Loans with at least one overdue installment need attention."
              : "No overdue loans are currently flagged."
          }
          icon={AlertTriangle}
          label="Overdue loans count"
          value={kpis.overdueLoansCount.toLocaleString("en-NG")}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <Badge className="w-fit">Capital Flow</Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-white">
              Monthly savings vs loan disbursements
            </CardTitle>
            <CardDescription className="text-slate-200">
              Compare how much the cooperative gathered in savings deposits
              against how much it released into the loan portfolio over the last
              twelve months.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[340px]">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={monthlySavingsVsLoanDisbursements}>
                  <CartesianGrid
                    stroke="rgba(255,255,255,0.12)"
                    vertical={false}
                  />
                  <XAxis
                    axisLine={false}
                    dataKey="label"
                    tick={{ fill: "#cbd5e1", fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    tick={{ fill: "#cbd5e1", fontSize: 12 }}
                    tickFormatter={(value) =>
                      formatDashboardCompactNaira(Number(value))
                    }
                    tickLine={false}
                    width={92}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(17, 24, 39, 0.98)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: "18px",
                    }}
                    formatter={(value) =>
                      formatDashboardNaira(Number(value))
                    }
                    labelStyle={{ color: "#cbd5e1" }}
                  />
                  <Legend />
                  <Bar
                    dataKey="savingsDeposits"
                    fill="#34d399"
                    name="Savings deposits"
                    radius={[10, 10, 0, 0]}
                  />
                  <Bar
                    dataKey="loanDisbursements"
                    fill="#f59e0b"
                    name="Loan disbursements"
                    radius={[10, 10, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="border-white/15 bg-[#111827]">
            <CardHeader>
              <Badge className="w-fit" variant="secondary">
                Loan Mix
              </Badge>
              <CardTitle className="font-['Outfit'] text-2xl text-white">
                Loan status distribution
              </CardTitle>
              <CardDescription className="text-slate-200">
                {totalLoansTracked > 0
                  ? `${totalLoansTracked} loans are currently tracked across active, completed, and defaulted states.`
                  : "Loan status segments will appear here once disbursements start."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasLoanStatusData ? (
                <div className="h-[250px]">
                  <ResponsiveContainer height="100%" width="100%">
                    <PieChart>
                      <Pie
                        cx="50%"
                        cy="50%"
                        data={loanStatusDistribution}
                        dataKey="value"
                        innerRadius={58}
                        nameKey="label"
                        outerRadius={92}
                        paddingAngle={3}
                      >
                        {loanStatusDistribution.map((point) => (
                          <Cell
                            key={point.status}
                            fill={point.color}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "rgba(17, 24, 39, 0.98)",
                          border: "1px solid rgba(255,255,255,0.16)",
                          borderRadius: "18px",
                        }}
                        formatter={(value) =>
                          `${Number(value ?? 0)} loan${Number(value ?? 0) === 1 ? "" : "s"}`
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-white/15 bg-slate-900/80 px-4 py-10 text-center text-sm text-slate-200">
                  No loan records are available yet.
                </div>
              )}

              <div className="grid gap-2">
                {loanStatusDistribution.map((point) => (
                  <div
                    key={point.status}
                    className="flex items-center justify-between rounded-2xl border border-white/15 bg-slate-900/80 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: point.color }}
                      />
                      <span className="text-sm text-slate-200">{point.label}</span>
                    </div>
                    <span className="font-medium text-white">{point.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/15 bg-[#111827]">
            <CardHeader>
              <Badge className="w-fit" variant="outline">
                Member Growth
              </Badge>
              <CardTitle className="font-['Outfit'] text-2xl text-white">
                Members joined per month
              </CardTitle>
              <CardDescription className="text-slate-200">
                {joinedMembersLastTwelveMonths.toLocaleString("en-NG")} new
                registered member
                {joinedMembersLastTwelveMonths === 1 ? "" : "s"} in the last
                twelve months.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[260px]">
                <ResponsiveContainer height="100%" width="100%">
                  <LineChart data={memberGrowth}>
                    <CartesianGrid
                      stroke="rgba(255,255,255,0.12)"
                      vertical={false}
                    />
                    <XAxis
                      axisLine={false}
                      dataKey="label"
                      tick={{ fill: "#cbd5e1", fontSize: 12 }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tick={{ fill: "#cbd5e1", fontSize: 12 }}
                      tickLine={false}
                      width={52}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(17, 24, 39, 0.98)",
                        border: "1px solid rgba(255,255,255,0.16)",
                        borderRadius: "18px",
                      }}
                      formatter={(value) =>
                        `${Number(value ?? 0)} joined`
                      }
                      labelStyle={{ color: "#cbd5e1" }}
                    />
                    <Line
                      activeDot={{ r: 6 }}
                      dataKey="membersJoined"
                      dot={{ fill: "#38bdf8", r: 4, strokeWidth: 0 }}
                      stroke="#38bdf8"
                      strokeWidth={3}
                      type="monotone"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-white/15 bg-[#111827]">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <Badge className="w-fit">Live Feed</Badge>
              <CardTitle className="mt-3 font-['Outfit'] text-2xl text-white">
                Recent activity
              </CardTitle>
              <CardDescription className="text-slate-200">
                Last 10 transactions across savings, loans, and shares. New
                entries appear automatically.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-200">
              {isRefreshingActivity ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Refreshing
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4 text-emerald-300" />
                  Live
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {activityError ? (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {activityError}
              </div>
            ) : null}

            {recentActivity.length > 0 ? (
              recentActivity.map((item) => {
                const ActivityIcon = getActivityIcon(item.source);

                return (
                  <div
                    key={item.id}
                    className="rounded-[28px] border border-white/15 bg-slate-900/80 p-4"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${getActivityAccent(
                          item.source,
                        )}`}
                      >
                        <ActivityIcon className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <p className="font-medium text-white">{item.title}</p>
                            <p className="text-sm text-slate-200">
                              {item.memberName}
                              {item.memberNumber ? ` · ${item.memberNumber}` : ""}
                            </p>
                          </div>
                          <div className="text-left md:text-right">
                            <p
                              className={
                                item.amount < 0
                                  ? "font-medium text-rose-200"
                                  : "font-medium text-emerald-200"
                              }
                            >
                              {formatSignedAmount(item.amount)}
                            </p>
                            <p className="text-xs text-slate-300">
                              {formatDashboardRelativeTime(item.happenedAt)}
                            </p>
                          </div>
                        </div>

                        <p className="text-sm text-slate-300">{item.detail}</p>
                        <p className="text-xs text-slate-400">
                          {formatDashboardDateTime(item.happenedAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-3xl border border-dashed border-white/15 bg-slate-900/80 px-4 py-10 text-center text-sm text-slate-200">
                Activity will appear here once savings, loan, or share
                transactions start flowing in.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/15 bg-[#111827]">
          <CardHeader>
            <Badge className="w-fit" variant="secondary">
              Quick Actions
            </Badge>
            <CardTitle className="font-['Outfit'] text-2xl text-white">
              Move straight into the next admin task
            </CardTitle>
            <CardDescription className="text-slate-200">
              Shortcuts to the most common cooperative operations your team needs
              during the workday.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button
              asChild
              className="h-auto justify-start rounded-[28px] border border-white/15 bg-slate-900/90 px-5 py-4 text-left text-white hover:bg-slate-800"
              variant="secondary"
            >
              <Link href="/register">
                <div className="flex w-full items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-200">
                      <UserPlus className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">Register New Member</p>
                      <p className="mt-1 text-sm text-slate-200">
                        Open the member onboarding form and start a new
                        registration.
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="mt-1 h-4 w-4 shrink-0" />
                </div>
              </Link>
            </Button>

            <Button
              asChild
              className="h-auto justify-start rounded-[28px] border border-white/15 bg-slate-900/90 px-5 py-4 text-left text-white hover:bg-slate-800"
              variant="secondary"
            >
              <Link href="/admin/finance">
                <div className="flex w-full items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-100">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">Record Payment</p>
                      <p className="mt-1 text-sm text-slate-200">
                        Post deposits and withdrawals against member savings
                        accounts.
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="mt-1 h-4 w-4 shrink-0" />
                </div>
              </Link>
            </Button>

            <Button
              asChild
              className="h-auto justify-start rounded-[28px] border border-white/15 bg-slate-900/90 px-5 py-4 text-left text-white hover:bg-slate-800"
              variant="secondary"
            >
              <Link href="/admin/loans">
                <div className="flex w-full items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-100">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">Review Pending Loans</p>
                        {kpis.pendingLoanReviewCount > 0 ? (
                          <Badge className="w-fit" variant="outline">
                            {kpis.pendingLoanReviewCount} pending
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-200">
                        Open the loan processing board and move applications
                        forward.
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="mt-1 h-4 w-4 shrink-0" />
                </div>
              </Link>
            </Button>

            <Button
              asChild
              className="h-auto justify-start rounded-[28px] border border-white/15 bg-slate-900/90 px-5 py-4 text-left text-white hover:bg-slate-800"
              variant="secondary"
            >
              <Link href="/admin/shares">
                <div className="flex w-full items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-400/15 text-violet-100">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">Declare Dividend</p>
                      <p className="mt-1 text-sm text-slate-200">
                        Head to share capital management and prepare a dividend
                        declaration.
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="mt-1 h-4 w-4 shrink-0" />
                </div>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
