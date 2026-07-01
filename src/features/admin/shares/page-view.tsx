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
  ArrowRightLeft,
  ArrowUpDown,
  Coins,
  Download,
  Landmark,
  Percent,
  PlusCircle,
  Search,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  formatCompactNaira,
  formatDisplayDate,
  formatDividendStatusLabel,
  formatNaira,
  getDividendStatusTone,
  getShareRegisterSummary,
  type DividendDeclarationRow,
  type ShareConfig,
  type ShareMemberOption,
  type ShareRegisterRow,
} from "@/lib/shares";
import { DividendDeclarationDialog } from "@/features/admin/shares/dividend-dialog";
import { SharePurchaseDialog } from "@/features/admin/shares/purchase-dialog";
import { ShareTransferDialog } from "@/features/admin/shares/transfer-dialog";

type AdminSharesPageViewProps = {
  config: ShareConfig | null;
  dataError?: string | null;
  declarations: DividendDeclarationRow[];
  members: ShareMemberOption[];
  register: ShareRegisterRow[];
};

export default function AdminSharesPageView({
  config,
  dataError,
  declarations,
  members,
  register,
}: AdminSharesPageViewProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "totalShares", desc: true },
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [dividendOpen, setDividendOpen] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  const summary = useMemo(() => getShareRegisterSummary(register), [register]);

  const filteredRegister = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return register.filter((row) => {
      if (!normalizedSearch) {
        return true;
      }

      return (
        row.memberName.toLowerCase().includes(normalizedSearch) ||
        row.memberEmail.toLowerCase().includes(normalizedSearch) ||
        row.memberNumber?.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [register, searchQuery]);

  const columns = useMemo<ColumnDef<ShareRegisterRow>[]>(
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
              {row.original.memberNumber ?? "No member number"} ·{" "}
              {row.original.memberEmail}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "totalShares",
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-2 text-left"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            type="button"
          >
            Shares
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <span className="font-medium text-white">{row.original.totalShares}</span>
        ),
      },
      {
        accessorKey: "totalValue",
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-2 text-left"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            type="button"
          >
            Value
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <span className="font-medium text-white">
            {formatNaira(row.original.totalValue)}
          </span>
        ),
      },
      {
        accessorKey: "lastUpdated",
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-2 text-left"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            type="button"
          >
            Updated
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: ({ row }) => formatDisplayDate(row.original.lastUpdated),
      },
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: filteredRegister,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  const handleCompleted = (message: string) => {
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
        share_units: row.original.totalShares,
        share_value: row.original.totalValue,
        last_updated: formatDisplayDate(row.original.lastUpdated),
      }));

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Share Register");
      XLSX.writeFile(
        workbook,
        `ifemelumma-share-register-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-3">
          <Badge className="w-fit">Share Management</Badge>
          <div className="space-y-2">
            <h2 className="font-['Outfit'] text-3xl font-semibold text-white">
              Manage member share capital and year-end dividends
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-300">
              Record share purchases, move shares between members, track the
              live share register, and generate dividend payment rows for each
              financial year.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button disabled={!config} onClick={() => setPurchaseOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Record Purchase
          </Button>
          <Button
            disabled={!config}
            onClick={() => setTransferOpen(true)}
            variant="secondary"
          >
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            Transfer Shares
          </Button>
          <Button
            disabled={!config || summary.totalSharesOutstanding === 0}
            onClick={() => setDividendOpen(true)}
            variant="secondary"
          >
            <Percent className="mr-2 h-4 w-4" />
            Declare Dividend
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

      {!config ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Share configuration is missing. Run the updated main Supabase schema
          so the default share unit value can be created.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-white/[0.06]">
          <CardHeader>
            <Badge className="w-fit">Share capital</Badge>
            <CardTitle className="font-['Outfit'] text-3xl">
              {formatNaira(summary.totalShareCapitalValue)}
            </CardTitle>
            <CardDescription>
              Total current value of issued member shares.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-white/[0.06]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Badge className="w-fit">Units issued</Badge>
              <Coins className="h-5 w-5 text-emerald-200" />
            </div>
            <CardTitle className="font-['Outfit'] text-3xl">
              {summary.totalSharesOutstanding.toLocaleString("en-NG")}
            </CardTitle>
            <CardDescription>
              Share units currently held across the cooperative.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-white/[0.06]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Badge className="w-fit" variant="secondary">
                Members holding shares
              </Badge>
              <Users className="h-5 w-5 text-sky-200" />
            </div>
            <CardTitle className="font-['Outfit'] text-3xl">
              {summary.totalMembersWithShares}
            </CardTitle>
            <CardDescription>
              Members with at least one active share unit right now.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-white/[0.06]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Badge className="w-fit" variant="outline">
                Share setup
              </Badge>
              <Landmark className="h-5 w-5 text-amber-200" />
            </div>
            <CardTitle className="font-['Outfit'] text-3xl">
              {config ? formatNaira(config.shareValue) : "Not set"}
            </CardTitle>
            <CardDescription>
              {config
                ? `Current unit price · minimum opening target ${config.minimumShares} share${
                    config.minimumShares === 1 ? "" : "s"
                  }.`
                : "Share unit value is not configured yet."}
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden bg-white/[0.04]">
          <CardHeader className="gap-4 border-b border-white/10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <Badge className="w-fit" variant="secondary">
                  Share register
                </Badge>
                <div>
                  <CardTitle className="font-['Outfit'] text-2xl">
                    All members and their share counts
                  </CardTitle>
                  <CardDescription>
                    {table.getRowModel().rows.length} visible member
                    {table.getRowModel().rows.length === 1 ? "" : "s"} ·{" "}
                    {formatCompactNaira(
                      table.getRowModel().rows.reduce(
                        (total, row) => total + row.original.totalValue,
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
                    <TableCell className="py-10 text-center text-slate-400" colSpan={4}>
                      No share register records match the current search yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.04]">
          <CardHeader>
            <Badge className="w-fit" variant="secondary">
              Dividend history
            </Badge>
            <CardTitle className="font-['Outfit'] text-2xl">
              Recent declarations
            </CardTitle>
            <CardDescription>
              Review declared profits, unit dividend rates, and generated payment
              rows for each financial year.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {declarations.length > 0 ? (
              declarations.map((declaration) => (
                <div
                  key={declaration.id}
                  className="rounded-3xl border border-white/10 bg-slate-950/60 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-white">
                          Financial Year {declaration.financialYear}
                        </p>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${getDividendStatusTone(
                            declaration.status,
                          )}`}
                        >
                          {formatDividendStatusLabel(declaration.status)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300">
                        Declared by {declaration.declaredByName}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Payment rows
                      </p>
                      <p className="mt-2 font-medium text-white">
                        {declaration.paymentCount}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Total profit
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {formatNaira(declaration.totalProfit)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-emerald-200">
                        Dividend per share
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {formatNaira(declaration.dividendPerShare)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-slate-400">
                    Declared {formatDisplayDate(declaration.declarationDate)}
                    {declaration.paymentDate
                      ? ` · Payment date ${formatDisplayDate(declaration.paymentDate)}`
                      : ""}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-10 text-center text-sm text-slate-400">
                No dividend declarations have been recorded yet.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <SharePurchaseDialog
        members={members}
        minimumShares={config?.minimumShares ?? 1}
        onCompleted={handleCompleted}
        onOpenChange={setPurchaseOpen}
        open={purchaseOpen}
        shareValue={config?.shareValue ?? 0}
      />

      <ShareTransferDialog
        members={members}
        onCompleted={handleCompleted}
        onOpenChange={setTransferOpen}
        open={transferOpen}
        shareValue={config?.shareValue ?? 0}
      />

      <DividendDeclarationDialog
        onCompleted={handleCompleted}
        onOpenChange={setDividendOpen}
        open={dividendOpen}
        totalSharesOutstanding={summary.totalSharesOutstanding}
      />

      {isRefreshing ? (
        <p className="text-sm text-slate-400">
          Refreshing the share register after the latest update...
        </p>
      ) : null}
    </div>
  );
}
