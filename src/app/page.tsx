"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  buildAuthCallbackForwardUrl,
  hasSupabaseAuthCallback,
} from "@/lib/auth/email-auth";

export default function HomePage() {
  useEffect(() => {
    if (hasSupabaseAuthCallback(window.location.href)) {
      window.location.replace(buildAuthCallbackForwardUrl(window.location.href));
      return;
    }

    window.location.replace("/login/");
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <p className="text-sm text-muted-foreground">
        Opening the cooperative portal…{" "}
        <Link className="text-emerald-700 underline dark:text-emerald-200" href="/login/">
          Continue to sign in
        </Link>
      </p>
    </main>
  );
}
