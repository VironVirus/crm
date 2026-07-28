"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env/public";

export function createBrowserSupabaseClient() {
  return createBrowserClient<any, "public">(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
  );
}
