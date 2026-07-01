"use client";

import { ReactNode, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignOutButton({
  className,
  icon,
  label,
}: {
  className?: string;
  icon?: ReactNode;
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className={className}
      type="button"
      onClick={() => {
        startTransition(() => {
          void (async () => {
            const supabase = createBrowserSupabaseClient();
            await supabase.auth.signOut();
            router.replace("/login");
            router.refresh();
          })();
        });
      }}
    >
      {isPending ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        icon ?? <LogOut size={16} />
      )}
      <span style={{ fontSize: "0.85rem" }}>{label ?? "Sign out"}</span>
    </button>
  );
}
