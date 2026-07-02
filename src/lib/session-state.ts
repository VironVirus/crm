export const PROTECTED_SESSION_IDLE_LIMIT_MS = 30 * 60 * 1000;

const PROTECTED_SESSION_ACTIVE_KEY = "ifemelunma-protected-session-active";
const PROTECTED_SESSION_LAST_ACTIVITY_KEY =
  "ifemelunma-protected-session-last-activity";

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function activateProtectedSession() {
  if (!canUseSessionStorage()) {
    return;
  }

  const timestamp = String(Date.now());

  window.sessionStorage.setItem(PROTECTED_SESSION_ACTIVE_KEY, "1");
  window.sessionStorage.setItem(PROTECTED_SESSION_LAST_ACTIVITY_KEY, timestamp);
}

export function clearProtectedSession() {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.removeItem(PROTECTED_SESSION_ACTIVE_KEY);
  window.sessionStorage.removeItem(PROTECTED_SESSION_LAST_ACTIVITY_KEY);
}

export function hasProtectedSessionMarker() {
  if (!canUseSessionStorage()) {
    return false;
  }

  return window.sessionStorage.getItem(PROTECTED_SESSION_ACTIVE_KEY) === "1";
}

export function recordProtectedSessionActivity() {
  if (!canUseSessionStorage() || !hasProtectedSessionMarker()) {
    return;
  }

  window.sessionStorage.setItem(
    PROTECTED_SESSION_LAST_ACTIVITY_KEY,
    String(Date.now()),
  );
}

export function hasProtectedSessionExpired() {
  if (!canUseSessionStorage()) {
    return false;
  }

  const lastActivity = Number(
    window.sessionStorage.getItem(PROTECTED_SESSION_LAST_ACTIVITY_KEY) ?? "0",
  );

  if (!Number.isFinite(lastActivity) || lastActivity <= 0) {
    return true;
  }

  return Date.now() - lastActivity >= PROTECTED_SESSION_IDLE_LIMIT_MS;
}
