"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { Loader2, Pencil, PlusCircle, Settings2, WalletCards } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatNaira, formatLoanInterestTypeLabel, type LoanProductOption } from "@/lib/loans";
import { type ShareConfig } from "@/lib/shares";
import {
  loanProductManagementSchema,
  shareConfigUpdateSchema,
} from "@/lib/validation/admin";

type EnvironmentRequirement = {
  description: string;
  name: string;
};

type LoanProductFormValues = {
  description?: string | null;
  interestRate: number;
  interestType: LoanProductOption["interestType"];
  isActive: boolean;
  maxAmount: number;
  maxLoanToSavingsRatio: number;
  maxTenureMonths: number;
  maximumDisbursableAmount?: number | null;
  minAmount: number;
  minTenureMonths: number;
  name: string;
  penaltyRate: number;
  processingFeeRate: number;
  termsSummary?: string | null;
};

type ShareConfigFormValues = {
  minimumShares: number;
  shareValue: number;
};

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-700 dark:text-rose-100">{message}</p>;
}

function FieldHint({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-5 text-muted-foreground">{children}</p>;
}

function getLoanProductSnapshot(values: LoanProductFormValues) {
  return [
    `Members can borrow between ${formatNaira(Math.max(values.minAmount || 0, 0))} and ${formatNaira(Math.max(values.maxAmount || 0, 0))}.`,
    `${formatLoanInterestTypeLabel(values.interestType)} interest at ${Number(values.interestRate || 0).toFixed(2)}% across ${Math.max(values.minTenureMonths || 0, 0)} to ${Math.max(values.maxTenureMonths || 0, 0)} months.`,
    `A ${Number(values.maxLoanToSavingsRatio || 0).toFixed(2)}x savings ratio means a member with ₦100,000 in savings can unlock up to ${formatNaira(Math.max((values.maxLoanToSavingsRatio || 0) * 100000, 0))} before the product cap applies.`,
    `Processing fee is ${Number(values.processingFeeRate || 0).toFixed(2)}% and overdue penalty is ${Number(values.penaltyRate || 0).toFixed(2)}%.`,
  ];
}

function LoanProductDialog({
  onCompleted,
  product,
}: {
  onCompleted: (message: string) => void;
  product?: LoanProductOption | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const defaultValues = useMemo<LoanProductFormValues>(
    () => ({
      description: product?.description ?? "",
      interestRate: product?.interestRate ?? 0,
      interestType: product?.interestType ?? "flat",
      isActive: product?.isActive ?? true,
      maxAmount: product?.maxAmount ?? 0,
      maxLoanToSavingsRatio: product?.maxLoanToSavingsRatio ?? 2,
      maxTenureMonths: product?.maxTenureMonths ?? 12,
      maximumDisbursableAmount: product?.maximumDisbursableAmount ?? null,
      minAmount: product?.minAmount ?? 0,
      minTenureMonths: product?.minTenureMonths ?? 1,
      name: product?.name ?? "",
      penaltyRate: product?.penaltyRate ?? 0,
      processingFeeRate: product?.processingFeeRate ?? 0,
      termsSummary: product?.termsSummary ?? "",
    }),
    [product],
  );
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    watch,
  } = useForm<LoanProductFormValues>({
    resolver:
      zodResolver(loanProductManagementSchema) as Resolver<LoanProductFormValues>,
    defaultValues,
  });
  const watchedValues = watch();

  const submit = handleSubmit(async (values) => {
    setServerError(null);

    const response = await fetch(
      product ? `/api/admin/loan-products/${product.id}` : "/api/admin/loan-products",
      {
        body: JSON.stringify(values),
        headers: {
          "Content-Type": "application/json",
        },
        method: product ? "PATCH" : "POST",
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setServerError(payload?.message ?? "Unable to save this loan product.");
      return;
    }

    onCompleted(payload?.message ?? "Loan product saved successfully.");
    setOpen(false);
    reset(defaultValues);
    router.refresh();
  });

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          reset(defaultValues);
          setServerError(null);
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button variant={product ? "secondary" : "default"}>
          {product ? (
            <>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </>
          ) : (
            <>
              <PlusCircle className="mr-2 h-4 w-4" />
              New loan product
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {product ? "Edit loan product" : "Create loan product"}
          </DialogTitle>
          <DialogDescription>
            Set the loan limits, pricing, and product terms members will apply against.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <div className="rounded-3xl border border-emerald-400/15 bg-emerald-500/10 p-4 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-100">
              Quick summary
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {getLoanProductSnapshot(watchedValues).map((summary) => (
                <div
                  key={summary}
                  className="rounded-2xl border border-emerald-400/20 bg-background/70 px-4 py-3 text-sm text-foreground"
                >
                  {summary}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="name">Product name</Label>
            <Input id="name" placeholder="Salary advance" {...register("name")} />
            <FieldHint>Use a short product name members will quickly recognize on the loan application page.</FieldHint>
            <FieldMessage message={errors.name?.message} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Short member-facing description of this loan"
              {...register("description")}
            />
            <FieldHint>This is the short overview members will read before they apply.</FieldHint>
            <FieldMessage message={errors.description?.message} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="termsSummary">Terms summary</Label>
            <Textarea
              id="termsSummary"
              placeholder="Example: Available after 6 months of membership and one guarantor."
              {...register("termsSummary")}
            />
            <FieldHint>Keep this brief. It should summarize who qualifies, any documents needed, and special limits.</FieldHint>
            <FieldMessage message={errors.termsSummary?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="interestRate">Interest rate (%)</Label>
            <Input id="interestRate" step="0.01" type="number" {...register("interestRate")} />
            <FieldHint>The annual percentage rate used when calculating the member&apos;s loan cost.</FieldHint>
            <FieldMessage message={errors.interestRate?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="interestType">Interest type</Label>
            <select
              className="flex h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-emerald-400/60"
              id="interestType"
              {...register("interestType")}
            >
              <option value="flat">Flat</option>
              <option value="reducing_balance">Reducing balance</option>
            </select>
            <FieldHint>Flat keeps the interest charge level. Reducing balance lowers interest as the loan is repaid.</FieldHint>
            <FieldMessage message={errors.interestType?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="minAmount">Minimum amount</Label>
            <Input id="minAmount" step="0.01" type="number" {...register("minAmount")} />
            <FieldHint>The smallest amount members can request on this product.</FieldHint>
            <FieldMessage message={errors.minAmount?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxAmount">Maximum amount</Label>
            <Input id="maxAmount" step="0.01" type="number" {...register("maxAmount")} />
            <FieldHint>The full product cap before any savings-ratio or operational limit is applied.</FieldHint>
            <FieldMessage message={errors.maxAmount?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maximumDisbursableAmount">Max disbursable now</Label>
            <Input
              id="maximumDisbursableAmount"
              step="0.01"
              type="number"
              {...register("maximumDisbursableAmount")}
            />
            <FieldHint>Use this when the product exists but you only want to release a smaller amount for now.</FieldHint>
            <FieldMessage message={errors.maximumDisbursableAmount?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxLoanToSavingsRatio">Max loan to savings ratio</Label>
            <Input
              id="maxLoanToSavingsRatio"
              step="0.01"
              type="number"
              {...register("maxLoanToSavingsRatio")}
            />
            <FieldHint>A value of 2 means savings of ₦50,000 can support up to ₦100,000, subject to the product cap.</FieldHint>
            <FieldMessage message={errors.maxLoanToSavingsRatio?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="minTenureMonths">Minimum tenure (months)</Label>
            <Input
              id="minTenureMonths"
              type="number"
              {...register("minTenureMonths")}
            />
            <FieldHint>The shortest repayment duration a member can choose.</FieldHint>
            <FieldMessage message={errors.minTenureMonths?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxTenureMonths">Maximum tenure (months)</Label>
            <Input
              id="maxTenureMonths"
              type="number"
              {...register("maxTenureMonths")}
            />
            <FieldHint>The longest repayment duration allowed for this product.</FieldHint>
            <FieldMessage message={errors.maxTenureMonths?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="processingFeeRate">Processing fee (%)</Label>
            <Input
              id="processingFeeRate"
              step="0.01"
              type="number"
              {...register("processingFeeRate")}
            />
            <FieldHint>A one-time percentage fee charged when the loan is booked or disbursed.</FieldHint>
            <FieldMessage message={errors.processingFeeRate?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="penaltyRate">Penalty rate (%)</Label>
            <Input
              id="penaltyRate"
              step="0.01"
              type="number"
              {...register("penaltyRate")}
            />
            <FieldHint>The extra percentage applied when a repayment becomes overdue.</FieldHint>
            <FieldMessage message={errors.penaltyRate?.message} />
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm text-foreground md:col-span-2">
            <input className="h-4 w-4" type="checkbox" {...register("isActive")} />
            Accept new member applications for this product
          </label>

          {serverError ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100 md:col-span-2">
              {serverError}
            </div>
          ) : null}

          <div className="flex justify-end md:col-span-2">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : product ? (
                "Save changes"
              ) : (
                "Create product"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminSettingsPageView({
  loanProducts,
  recommended,
  required,
  shareConfig,
}: {
  loanProducts: LoanProductOption[];
  recommended: EnvironmentRequirement[];
  required: EnvironmentRequirement[];
  shareConfig: ShareConfig | null;
}) {
  const router = useRouter();
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [shareConfigError, setShareConfigError] = useState<string | null>(null);
  const [isRefreshing, startTransition] = useTransition();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<ShareConfigFormValues>({
    resolver:
      zodResolver(shareConfigUpdateSchema) as Resolver<ShareConfigFormValues>,
    defaultValues: {
      minimumShares: shareConfig?.minimumShares ?? 1,
      shareValue: shareConfig?.shareValue ?? 1000,
    },
  });

  const saveShareConfig = handleSubmit(async (values) => {
    setShareConfigError(null);

    const response = await fetch("/api/admin/share-config", {
      body: JSON.stringify(values),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setShareConfigError(
        payload?.message ?? "Unable to update the share configuration.",
      );
      return;
    }

    setFeedbackMessage(payload?.message ?? "Share configuration updated.");
    startTransition(() => {
      router.refresh();
    });
  });

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-border bg-card p-6 shadow-2xl shadow-black/10 dark:shadow-black/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge className="w-fit">Settings</Badge>
            <h2 className="max-w-2xl font-['Outfit'] text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
              Operations and deployment setup
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage the live loan products, share setup, and payment testing mode from one place.
            </p>
          </div>
          <LoanProductDialog
            onCompleted={(message) => {
              setFeedbackMessage(message);
            }}
          />
        </div>
      </section>

      {feedbackMessage ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
          {feedbackMessage}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <WalletCards className="h-5 w-5 text-emerald-700 dark:text-emerald-200" />
              <div>
                <CardTitle className="font-['Outfit'] text-2xl text-foreground">
                  Mock Flutterwave test mode
                </CardTitle>
                <CardDescription>
                  Enable demo payments that still post into the live dashboards.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
              Set `FLUTTERWAVE_MOCK_MODE=true` and `APP_URL` to your deployed site URL on Netlify.
            </div>
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
              When enabled, member payments go through the demo checkout and still create real savings, loan, or share transactions for testing.
            </div>
            <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
              The test transactions stay visible in the dashboards until you clear them later from your database.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Settings2 className="h-5 w-5 text-amber-700 dark:text-amber-200" />
              <div>
                <CardTitle className="font-['Outfit'] text-2xl text-foreground">
                  Share setup
                </CardTitle>
                <CardDescription>
                  Edit the unit value and minimum share entry target.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={saveShareConfig}>
              <div className="space-y-2">
                <Label htmlFor="shareValue">Share unit value</Label>
                <Input id="shareValue" step="0.01" type="number" {...register("shareValue")} />
                <FieldMessage message={errors.shareValue?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minimumShares">Minimum shares</Label>
                <Input id="minimumShares" type="number" {...register("minimumShares")} />
                <FieldMessage message={errors.minimumShares?.message} />
              </div>
              {shareConfigError ? (
                <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
                  {shareConfigError}
                </div>
              ) : null}
              <Button disabled={isSubmitting || isRefreshing} type="submit">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save share setup"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="font-['Outfit'] text-2xl text-foreground">
            Loan products
          </CardTitle>
          <CardDescription>
            Members immediately use any active product from the portal loans page.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          {loanProducts.map((product) => (
            <div
              key={product.id}
              className="rounded-3xl border border-border bg-secondary px-5 py-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-['Outfit'] text-xl font-semibold text-foreground">
                      {product.name}
                    </p>
                    <Badge variant={product.isActive ? "secondary" : "outline"}>
                      {product.isActive ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {product.description || "No description added yet."}
                  </p>
                </div>
                <LoanProductDialog
                  onCompleted={(message) => {
                    setFeedbackMessage(message);
                  }}
                  product={product}
                />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    Pricing
                  </p>
                  <p className="mt-2 text-sm text-foreground">
                    {product.interestRate.toFixed(2)}% ·{" "}
                    {formatLoanInterestTypeLabel(product.interestType)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-card px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    Amount range
                  </p>
                  <p className="mt-2 text-sm text-foreground">
                    {formatNaira(product.minAmount)} to {formatNaira(product.maxAmount)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-card px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    Tenure
                  </p>
                  <p className="mt-2 text-sm text-foreground">
                    {product.minTenureMonths} to {product.maxTenureMonths} months
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-card px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    Operational terms
                  </p>
                  <p className="mt-2 text-sm text-foreground">
                    Fee {product.processingFeeRate.toFixed(2)}% · Penalty{" "}
                    {product.penaltyRate.toFixed(2)}%
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
                {product.termsSummary || "No additional terms summary has been added."}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
              Required environment variables
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {required.map((item) => (
              <div
                key={item.name}
                className="rounded-2xl border border-border bg-secondary px-4 py-4 text-sm"
              >
                <p className="font-medium text-foreground">{item.name}</p>
                <p className="mt-1 text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-['Outfit'] text-2xl text-foreground">
              Recommended environment variables
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {recommended.map((item) => (
              <div
                key={item.name}
                className="rounded-2xl border border-border bg-secondary px-4 py-4 text-sm"
              >
                <p className="font-medium text-foreground">{item.name}</p>
                <p className="mt-1 text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
