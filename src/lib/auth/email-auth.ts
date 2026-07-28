import { createBrowserClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env/public";
import { internalRedirectPathSchema } from "@/lib/validation/auth";

const AUTH_CONFIRM_PATH = "/auth/confirm/";

export type AuthIntent = "login" | "register";

type AuthCallbackSuccess = {
  intent: AuthIntent | null;
  nextPath: string;
  status: "success";
};

type AuthCallbackError = {
  message: string;
  status: "error";
};

export type AuthCallbackResult = AuthCallbackError | AuthCallbackSuccess;

function parseAuthIntent(value: string | null): AuthIntent | null {
  if (value === "login" || value === "register") {
    return value;
  }

  return null;
}

function decodeAuthMessage(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

export function normalizeAuthErrorMessage(
  value: unknown,
  fallbackMessage: string,
) {
  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (
      trimmedValue &&
      trimmedValue !== "{}" &&
      trimmedValue !== "[]"
    ) {
      return trimmedValue;
    }
  }

  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return normalizeAuthErrorMessage(value.message, fallbackMessage);
  }

  return fallbackMessage;
}

export function sanitizeInternalRedirectPath(value?: string | null) {
  const parsed = internalRedirectPathSchema.safeParse(value);
  return parsed.success ? parsed.data : "/portal";
}

export function buildEmailAuthRedirectUrl(
  intent: AuthIntent,
  nextPath?: string | null,
) {
  if (typeof window === "undefined") {
    return AUTH_CONFIRM_PATH;
  }

  const url = new URL(AUTH_CONFIRM_PATH, window.location.origin);
  url.searchParams.set("intent", intent);

  if (intent === "login") {
    url.searchParams.set("next", sanitizeInternalRedirectPath(nextPath));
  }

  return url.toString();
}

export function hasSupabaseAuthCallback(href: string) {
  const url = new URL(href);
  const hashParams = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
  );

  return (
    url.searchParams.has("code") ||
    url.searchParams.has("token_hash") ||
    url.searchParams.has("error") ||
    url.searchParams.has("error_description") ||
    hashParams.has("access_token") ||
    hashParams.has("refresh_token") ||
    hashParams.has("error") ||
    hashParams.has("error_description")
  );
}

export function buildAuthCallbackForwardUrl(href: string) {
  const currentUrl = new URL(href);
  const targetUrl = new URL(AUTH_CONFIRM_PATH, currentUrl.origin);

  currentUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  targetUrl.hash = currentUrl.hash;

  return targetUrl.toString();
}

export async function finishSupabaseAuthFromUrl(
  href: string,
): Promise<AuthCallbackResult> {
  const url = new URL(href);
  const hashParams = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
  );
  const errorMessage = decodeAuthMessage(
    url.searchParams.get("error_description") ??
      hashParams.get("error_description") ??
      url.searchParams.get("error") ??
      hashParams.get("error"),
  );

  if (errorMessage) {
    return { message: errorMessage, status: "error" };
  }

  const supabase = createBrowserClient<any, "public">(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      auth: {
        detectSessionInUrl: false,
      },
    },
  );

  const tokenHash = url.searchParams.get("token_hash");
  const authCode = url.searchParams.get("code");

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: (url.searchParams.get("type") ?? "email") as EmailOtpType,
    });

    if (error) {
      return {
        message: normalizeAuthErrorMessage(
          error.message,
          "We could not finish your sign-in from that email link. Please request a fresh one.",
        ),
        status: "error",
      };
    }
  } else if (authCode) {
    const { error } = await supabase.auth.exchangeCodeForSession(authCode);

    if (error) {
      return {
        message: normalizeAuthErrorMessage(
          error.message,
          "We could not finish your sign-in from that email link. Please request a fresh one.",
        ),
        status: "error",
      };
    }
  } else if (hashParams.has("access_token") && hashParams.has("refresh_token")) {
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (!accessToken || !refreshToken) {
      return {
        message: "This sign-in link is incomplete. Please request a fresh email.",
        status: "error",
      };
    }

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      return {
        message: normalizeAuthErrorMessage(
          error.message,
          "We could not finish your sign-in from that email link. Please request a fresh one.",
        ),
        status: "error",
      };
    }
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    return {
      message: normalizeAuthErrorMessage(
        error.message,
        "We could not confirm your sign-in session. Please try again.",
      ),
      status: "error",
    };
  }

  if (!session?.access_token) {
    return {
      message: "This email link has expired or is no longer valid. Please request a new one.",
      status: "error",
    };
  }

  return {
    intent: parseAuthIntent(url.searchParams.get("intent")),
    nextPath: sanitizeInternalRedirectPath(url.searchParams.get("next")),
    status: "success",
  };
}
