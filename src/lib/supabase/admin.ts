import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/env/public";
import { getSupabaseServiceRoleKey } from "@/lib/env/server";

export function createSupabaseAdminClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
