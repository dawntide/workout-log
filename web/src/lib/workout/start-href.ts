import { APP_ROUTES } from "@/lib/app-routes";

export const START_FALLBACK_HREF = APP_ROUTES.todayLog;

export function resolveStartHref(opts: {
  hasPlan: boolean;
  todayHref?: string | null;
}): string {
  if (!opts.hasPlan) return APP_ROUTES.programStore;
  return opts.todayHref ?? START_FALLBACK_HREF;
}
