"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export const STATIC_DATA_CHANGED_EVENT = "cooperative:data-changed";

export function notifyStaticDataChanged() {
  window.dispatchEvent(new Event(STATIC_DATA_CHANGED_EVENT));
}

export function useStaticPageData<T>(
  loader: (supabase: SupabaseClient, user: User) => Promise<T>,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const supabase = createBrowserSupabaseClient();

    async function load() {
      setIsLoading(true);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error(userError?.message ?? "Your session has expired.");
        }

        const nextData = await loader(supabase, user);

        if (active) {
          setData(nextData);
          setError(null);
        }
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "The cooperative data could not be loaded.",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void load();
    window.addEventListener(STATIC_DATA_CHANGED_EVENT, load);

    return () => {
      active = false;
      window.removeEventListener(STATIC_DATA_CHANGED_EVENT, load);
    };
  }, [loader]);

  return { data, error, isLoading };
}

export function StaticPageLoading({ label = "Loading cooperative data…" }: { label?: string }) {
  return (
    <div className="flex min-h-[45vh] items-center justify-center">
      <div className="rounded-3xl border border-border bg-card px-6 py-5 text-sm text-muted-foreground shadow-xl">
        {label}
      </div>
    </div>
  );
}

export function StaticPageError({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
      {children}
    </div>
  );
}
