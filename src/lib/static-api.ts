"use client";

import { getSupabaseUrl } from "@/lib/env/public";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function getStaticApiUrl(input: RequestInfo | URL) {
  const rawValue = typeof input === "string" ? input : input.toString();

  if (!rawValue.startsWith("/api/")) {
    return rawValue;
  }

  return `${getSupabaseUrl()}/functions/v1/cooperative-api${rawValue.slice(4)}`;
}

export async function staticApiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  const {
    data: { session },
  } = await createBrowserSupabaseClient().auth.getSession();

  if (session?.access_token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const response = await fetch(getStaticApiUrl(input), {
    ...init,
    headers,
  });

  const method = (init.method ?? "GET").toUpperCase();

  if (response.ok && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    window.dispatchEvent(new Event("cooperative:data-changed"));
  }

  return response;
}
