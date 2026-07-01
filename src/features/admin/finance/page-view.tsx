"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  Download,
  Landmark,
  MinusCircle,
  PiggyBank,
  PlusCircle,
  Search,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatAccountTypeLabel,
  formatCompactNaira,
  formatDisplayDate,
  formatNaira,
  getSavingsSummary,
  getTotalSavingsBalance,
  type SavingsAccountRow,
  type SavingsAccountType,
  type SavingsMemberOption,
} from "@/lib/savings";
import { SavingsTransactionDialog } from "@/features/admin/finance/transaction-dialog";

type AdminSavingsPageViewProps = {
  accounts: SavingsAccountRow[];
  dataError?: string | null;
  members: SavingsMemberOption[];
};

type AccountFilter = "all" | SavingsAccountType;

function getAccountTypeBadgeVariant(accountType: SavingsAccountType) {
  if (accountType === "fixed_deposit") {
    return "outline" as const;
  }

  if (accountType === "voluntary") {
    return "secondary" as const;
  }

  return "default" as const;
}

export default function AdminSavingsPageView({
  accounts,
  dataError,
  members,
}: AdminSavingsPageViewProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "balance", desc: true },
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [isExporting, setIsExporting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  const summary = useMemo(() => getSavingsSummary(accounts), [accounts]);
  const totalSavingsBalance = useMemo(
    () => getTotalSavingsBalance(accounts),
    [accounts],
  );

  const filteredAccounts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return accounts.filter((account) => {
      const matchesType =
        accountFilter === "all" || account.accountType === accountFilter;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        account.memberName.toLowerCase().includes(normalizedSearch) ||
        account.memberEmail.toLowerCase().includes(normalizedSearch) ||
        account.memberNumber?.toLowerCase().includes(normalizedSearch);

      return matchesType && matchesSearch;
    });
  }, [accountFilter, accounts, searchQuery]);

  const columns = useMemo<ColumnDef<SavingsAccountRow>[]>(
    () => [
      {
        accessorKey: "memberName",
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-2 text-left"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            type="button"
          >
            Member
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-white">{row.original.memberName}</p>
            <p className="text-xs text-slate-400">
              {row.original.memberNumber ?? "Member number pending"} ·{" "}
              {row.original.memberEmail}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "accountType",
        header: "Account Type",
        cell: ({ row }) => (
          <Badge variant={getAccountTypeBadgeVariant(row.original.accountType)}>
            {formatAccountTypeLabel(row.original.accountType)}
          </Badge>
        ),
      },
      {
        accessorKey: "balance",
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-2 text-left"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            type="button"
          >
            Balance
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-white">
              {formatNaira(row.original.balance)}
            </p>
            <p className="text-xs text-slate-400">
              Interest: {row.original.interestRate.toFixed(2)}%
            </p>
          </div>
        ),
      },
      {
        accessorKey: "maturityDate",
        header: "Maturity",
        cell: ({ row }) =>
          row.original.accountType === "fixed_deposit"
            ? formatDisplayDate(row.original.maturityDate)
            : "Not applicable",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            className={
              row.original.status === "active"
                ? undefined
                : "border-rose-400/20 bg-rose-500/10 text-rose-100"
            }
            variant={row.original.status === "active" ? "default" : "secondary"}
          >
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-2 text-left"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            type="button"
          >
            Created
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: ({ row }) => formatDisplayDate(row.original.createdAt),
      },
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: filteredAccounts,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  const handleTransactionCompleted = (message: string) => {
    setFeedbackMessage(message);

    startTransition(() => {
      router.refresh();
    });
  };

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const XLSX = await import("xlsx");
      const rows = table.getRowModel().rows.map((row) => ({
        member_name: row.original.memberName,
        member_number: row.original.memberNumber ?? "",
        email: row.original.memberEmail,
        account_type: formatAccountTypeLabel(row.original.accountType),
        balance: row.original.balance,
        interest_rate: row.original.interestRate,
        maturity_date:
          row.original.accountType === "fixed_deposit"
            ? formatDisplayDate(row.original.maturityDate)
            : "",
        status: row.original.status,
        created_at: formatDisplayDate(row.original.createdAt),
      }));

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Savings Accounts");
      XLSX.writeFile(
        workbook,
        `ifemelunma-savings-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-3">
          <Badge className="w-fit">Savings Management</Badge>
          <div className="space-y-2">
            <h2 className="font-['Outfit'] text-3xl font-semibold text-white">
              Member savings operations
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-300">
              Track every member savings account, review balances by savings type,
              and post deposits or withdrawals directly into the cooperative
              ledger.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => setDepositOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Record Deposit
          </Button>
          <Button onClick={() => setWithdrawalOpen(true)} variant="secondary">
            <MinusCircle className="mr-2 h-4 w-4" />
            Record Withdrawal
          </Button>
        </div>
      </section>

      {feedbackMessage ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {feedbackMessage}
        </div>
      ) : null}

      {dataError ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {dataError}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-white/[0.06]">
          <CardHeader>
            <Badge className="w-fit">Total portfolio</Badge>
            <CardTitle className="font-['Outfit'] text-3xl">
              {formatNaira(totalSavingsBalance)}
            </CardTitle>
            <CardDescription>
              Combined savings balance across all active member accounts.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-white/[0.06]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Badge className="w-fit">Mandatory</Badge>
              <PiggyBank className="h-5 w-5 text-emerald-200" />
            </div>
            <CardTitle className="font-['Outfit'] text-3xl">
              {formatNaira(summary.mandatory)}
            </CardTitle>
            <CardDescription>
              Long-term member contributions committed to the society.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-white/[0.06]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Badge className="w-fit" variant="secondary">
                Voluntary
              </Badge>
              <Wallet className="h-5 w-5 text-sky-200" />
            </div>
            <CardTitle className="font-['Outfit'] text-3xl">
              {formatNaira(summary.voluntary)}
            </CardTitle>
            <CardDescription>
              Flexible member balances available for additional savings.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-white/[0.06]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Badge className="w-fit" variant="outline">
                Fixed deposit
              </Badge>
              <Landmark className="h-5 w-5 text-amber-200" />
            </div>
            <CardTitle className="font-['Outfit'] text-3xl">
              {formatNaira(summary.fixed_deposit)}
            </CardTitle>
            <CardDescription>
              Locked savings positions currently earning deposit returns.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <Card className="overflow-hidden bg-white/[0.04]">
        <CardHeader className="gap-4 border-b border-white/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <Badge className="w-fit" variant="secondary">
                Savings accounts ledger
              </Badge>
              <div>
                <CardTitle className="font-['Outfit'] text-2xl">
                  All member savings accounts
                </CardTitle>
                <CardDescription>
                  {table.getRowModel().rows.length} visible account
                  {table.getRowModel().rows.length === 1 ? "" : "s"} ·{" "}
                  {formatCompactNaira(
                    table.getRowModel().rows.reduce(
                      (total, row) => total + row.original.balance,
                      0,
                    ),
                  )}{" "}
                  in the current view
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative min-w-[260px]">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-11"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by member name or number"
                  value={searchQuery}
                />
              </div>

              <Button
                disabled={isExporting || table.getRowModel().rows.length === 0}
                onClick={handleExport}
                variant="secondary"
              >
                <Download className="mr-2 h-4 w-4" />
                {isExporting ? "Exporting..." : "Export Excel"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["all", "mandatory", "voluntary", "fixed_deposit"] as const).map(
              (value) => {
                const isActive = accountFilter === value;
                const label =
                  value === "all" ? "All accounts" : formatAccountTypeLabel(value);

                return (
                  <button
                    key={value}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      isActive
                        ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"
                        : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                    }`}
                    onClick={() => setAccountFilter(value)}
                    type="button"
                  >
                    {label}
                  </button>
                );
              },
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody>
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="py-10 text-center text-slate-400" colSpan={6}>
                    No savings accounts match the current filter yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SavingsTransactionDialog
        members={members}
        mode="deposit"
        onCompleted={handleTransactionCompleted}
        onOpenChange={setDepositOpen}
        open={depositOpen}
      />

      <SavingsTransactionDialog
        members={members}
        mode="withdrawal"
        onCompleted={handleTransactionCompleted}
        onOpenChange={setWithdrawalOpen}
        open={withdrawalOpen}
      />

      {isRefreshing ? (
        <p className="text-sm text-slate-400">
          Refreshing balances after the latest transaction...
        </p>
      ) : null}
    </div>
  );
}
