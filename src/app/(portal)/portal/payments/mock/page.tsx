"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function MockPaymentPage() {
  useEffect(() => {
    window.location.replace("/portal/actions/");
  }, []);

  return (
    <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
      Browser mock payments are disabled in the static production build.{" "}
      <Link className="text-emerald-700 underline dark:text-emerald-200" href="/portal/actions/">
        Return to member actions
      </Link>
    </div>
  );
}
