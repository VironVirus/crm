"use client";

import { useEffect } from "react";
import {
  buildAuthCallbackForwardUrl,
  hasSupabaseAuthCallback,
} from "@/lib/auth/email-auth";

export function AuthCallbackForwarder() {
  useEffect(() => {
    if (!hasSupabaseAuthCallback(window.location.href)) {
      return;
    }

    window.location.replace(buildAuthCallbackForwardUrl(window.location.href));
  }, []);

  return null;
}
