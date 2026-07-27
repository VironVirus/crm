"use client";

import type { ComponentProps } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import AdminReportsPageView from "@/features/admin/reports/page-view";
import {
  StaticPageError,
  StaticPageLoading,
  useStaticPageData,
} from "@/components/static/static-page-state";
import { getReportsPageData } from "@/lib/reports/server";

function getIsoDateDefaults() {
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10);
  const startDate = `${today.getUTCFullYear()}-01-01`;

  return {
    endDate,
    startDate,
  };
}

async function loadAdminReportsPage(
  admin: SupabaseClient,
): Promise<ComponentProps<typeof AdminReportsPageView>> {
  const { endDate, startDate } = getIsoDateDefaults();
  const { dataError, loanBookRows, members, monthlyCollections, trialBalanceRows } =
    await getReportsPageData(admin);

  return {
    dataError,
    defaultEndDate: endDate,
    defaultStartDate: startDate,
    loanBookRows,
    members,
    monthlyCollections,
    trialBalanceRows,
  };
}

export default function AdminReportsPage() {
  const { data, error, isLoading } = useStaticPageData(loadAdminReportsPage);

  if (isLoading && !data) return <StaticPageLoading label="Loading reports…" />;
  if (!data) return <StaticPageError>{error ?? "Reports are unavailable."}</StaticPageError>;

  return <AdminReportsPageView {...data} dataError={data.dataError ?? error} />;
}
