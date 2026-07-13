const ONBOARDING_DONE_KEY = "workout-log.v2.onboarding.done";

export function markOnboardingDone() {
  try {
    window.localStorage.setItem(ONBOARDING_DONE_KEY, "1");
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

export function isOnboardingDone(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
  } catch {
    return false;
  }
}
