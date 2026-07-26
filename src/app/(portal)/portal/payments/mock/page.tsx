import { redirect } from "next/navigation";
import MockPaymentPageView from "@/features/portal/payments/mock/page-view";
import { isFlutterwaveMockModeEnabled } from "@/lib/env/server";
import { readMockFlutterwaveSessionToken } from "@/lib/flutterwave/mock";
import { formatPaymentAmount, formatPaymentTypeLabel } from "@/lib/payments";

export default async function MockPaymentPage({
  searchParams,
}: {
  searchParams?: Promise<{
    session?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;

  if (!isFlutterwaveMockModeEnabled()) {
    redirect("/portal/actions");
  }

  if (!resolvedSearchParams?.session) {
    redirect("/portal/actions");
  }

  try {
    const session = readMockFlutterwaveSessionToken(
      resolvedSearchParams.session,
    );

    return (
      <MockPaymentPageView
        amountLabel={formatPaymentAmount(session.amount)}
        description={session.description}
        memberName={session.memberName}
        memberNumber={session.memberNumber}
        paymentTypeLabel={formatPaymentTypeLabel(session.paymentType)}
        sessionToken={resolvedSearchParams.session}
      />
    );
  } catch {
    redirect("/portal/actions");
  }
}
