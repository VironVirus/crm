"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  activateProtectedSession,
  clearProtectedSession,
  hasProtectedSessionExpired,
  hasProtectedSessionMarker,
  recordProtectedSessionActivity,
} from "@/lib/session-state";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function ProtectedSessionGuard({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isReady, setIsReady] = useState(false);
  const logoutStartedRef = useRef(false);

  useEffect(() => {
    const currentPath = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

    async function forceReauthentication() {
      if (logoutStartedRef.current) {
        return;
      }

      logoutStartedRef.current = true;
      clearProtectedSession();

      try {
        await createBrowserSupabaseClient().auth.signOut();
      } catch {}

      router.replace(`/login?next=${encodeURIComponent(currentPath)}`);
      router.refresh();
    }

    function trackActivity() {
      recordProtectedSessionActivity();
    }

    function verifySession() {
      if (!hasProtectedSessionMarker() || hasProtectedSessionExpired()) {
        void forceReauthentication();
        return;
      }

      activateProtectedSession();
      setIsReady(true);
    }

    verifySession();

    if (!hasProtectedSessionMarker()) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        verifySession();
      }
    };
    const intervalId = window.setInterval(verifySession, 60 * 1000);

    window.addEventListener("focus", verifySession);
    window.addEventListener("keydown", trackActivity);
    window.addEventListener("pointerdown", trackActivity);
    window.addEventListener("scroll", trackActivity, { passive: true });
    window.addEventListener("touchstart", trackActivity, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", verifySession);
      window.removeEventListener("keydown", trackActivity);
      window.removeEventListener("pointerdown", trackActivity);
      window.removeEventListener("scroll", trackActivity);
      window.removeEventListener("touchstart", trackActivity);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname, router, searchParams]);

  if (!isReady) {
    return <div className="min-h-[40vh]" />;
  }

  return <>{children}</>;
}
