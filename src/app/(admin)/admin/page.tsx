import AdminDashboardPageView from "@/features/admin/dashboard/page-view";
import { getAdminDashboardData } from "@/lib/dashboard/server";

export default async function AdminDashboardPage() {
  const dashboardData = await getAdminDashboardData();

  return <AdminDashboardPageView {...dashboardData} />;
}
