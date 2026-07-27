"use client";

import AdminDashboardPageView from "@/features/admin/dashboard/page-view";
import {
  StaticPageError,
  StaticPageLoading,
  useStaticPageData,
} from "@/components/static/static-page-state";
import { getAdminDashboardData } from "@/lib/dashboard/server";

export default function AdminDashboardPage() {
  const { data, error, isLoading } = useStaticPageData(getAdminDashboardData);

  if (isLoading && !data) return <StaticPageLoading label="Loading the admin dashboard…" />;
  if (!data) return <StaticPageError>{error ?? "The dashboard is unavailable."}</StaticPageError>;

  return <AdminDashboardPageView {...data} dataError={data.dataError ?? error} />;
}
