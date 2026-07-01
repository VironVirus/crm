import AdminReportsPageView from "@/features/admin/reports/page-view";
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

export default async function AdminReportsPage() {
  const { endDate, startDate } = getIsoDateDefaults();
  const { dataError, loanBookRows, members, monthlyCollections, trialBalanceRows } =
    await getReportsPageData();

  return (
    <AdminReportsPageView
      dataError={dataError}
      defaultEndDate={endDate}
      defaultStartDate={startDate}
      loanBookRows={loanBookRows}
      members={members}
      monthlyCollections={monthlyCollections}
      trialBalanceRows={trialBalanceRows}
    />
  );
}
