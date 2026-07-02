import { redirect } from "next/navigation";
import MockPaymentPageView from "@/features/portal/payments/mock/page-view";
import { isFlutterwaveMockModeEnabled } from "@/lib/env/server";
import { readMockFlutterwaveSessionToken } from "@/lib/flutterwave/mock";
import { formatPaymentAmount, formatPaymentTypeLabel } from "@/lib/payments";

export default function MockPaymentPage({
  searchParams,
}: {
  searchParams?: {
    session?: string;
  };
}) {
  if (!isFlutterwaveMockModeEnabled()) {
    redirect("/portal/actions");
  }

  if (!searchParams?.session) {
    redirect("/portal/actions");
  }

  try {
    const session = readMockFlutterwaveSessionToken(searchParams.session);

    return (
      <MockPaymentPageView
        amountLabel={formatPaymentAmount(session.amount)}
        description={session.description}
        memberName={session.memberName}
        memberNumber={session.memberNumber}
        paymentTypeLabel={formatPaymentTypeLabel(session.paymentType)}
        sessionToken={searchParams.session}
      />
    );
  } catch {
    redirect("/portal/actions");
  }
}
