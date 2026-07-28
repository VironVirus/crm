import {
  memberRegistrationSchema,
  type MemberRegistrationValues,
} from "@/lib/validation/member-registration";

const PENDING_REGISTRATION_KEY = "ifemelunma-pending-registration";
const PENDING_REGISTRATION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

type StoredRegistrationDraft = {
  savedAt: number;
  values: MemberRegistrationValues;
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function clearPendingRegistrationDraft() {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(PENDING_REGISTRATION_KEY);
}

export function loadPendingRegistrationDraft() {
  if (!canUseLocalStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(PENDING_REGISTRATION_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as StoredRegistrationDraft;

    if (
      !parsedValue ||
      typeof parsedValue.savedAt !== "number" ||
      Date.now() - parsedValue.savedAt > PENDING_REGISTRATION_MAX_AGE_MS
    ) {
      clearPendingRegistrationDraft();
      return null;
    }

    const parsedDraft = memberRegistrationSchema.safeParse(parsedValue.values);

    if (!parsedDraft.success) {
      clearPendingRegistrationDraft();
      return null;
    }

    return parsedDraft.data;
  } catch {
    clearPendingRegistrationDraft();
    return null;
  }
}

export function savePendingRegistrationDraft(values: MemberRegistrationValues) {
  if (!canUseLocalStorage()) {
    return;
  }

  const draft: StoredRegistrationDraft = {
    savedAt: Date.now(),
    values,
  };

  window.localStorage.setItem(PENDING_REGISTRATION_KEY, JSON.stringify(draft));
}
