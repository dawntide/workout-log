const WEB_VITAL_NAMES = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"]);
const WEB_VITAL_RATINGS = new Set(["good", "needs-improvement", "poor"]);
const NAVIGATION_TYPES = new Set([
  "navigate",
  "reload",
  "back-forward",
  "back-forward-cache",
  "prerender",
  "restore",
]);

type PublicWebVitalProps = {
  metric: string;
  value: number;
  rating: string;
  navigationType: string;
  route: string;
};

export type PublicWebVitalEvent = {
  id: string;
  name: "web_vital";
  recordedAt: string;
  props: PublicWebVitalProps;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Privacy-minimized public telemetry boundary.
 *
 * Only Core Web Vital fields are retained: no query string, referrer, IP,
 * account identifier, user agent, or arbitrary client properties.
 */
export function normalizePublicWebVitalEvent(
  raw: unknown,
  now = new Date(),
): PublicWebVitalEvent | null {
  if (!isPlainObject(raw) || raw.name !== "web_vital") return null;

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const recordedAt =
    typeof raw.recordedAt === "string" ? raw.recordedAt.trim() : "";
  const props = isPlainObject(raw.props) ? raw.props : null;
  if (!props || id.length < 8 || id.length > 128) return null;

  const eventTime = new Date(recordedAt).getTime();
  const oldestAllowed = now.getTime() - 7 * 86_400_000;
  const newestAllowed = now.getTime() + 5 * 60_000;
  if (
    !Number.isFinite(eventTime) ||
    eventTime < oldestAllowed ||
    eventTime > newestAllowed
  ) {
    return null;
  }

  const metric = typeof props.metric === "string" ? props.metric : "";
  const value = typeof props.value === "number" ? props.value : Number.NaN;
  const rating = typeof props.rating === "string" ? props.rating : "";
  const navigationType =
    typeof props.navigationType === "string" ? props.navigationType : "";
  const route = typeof props.route === "string" ? props.route : "";

  if (!WEB_VITAL_NAMES.has(metric)) return null;
  if (!Number.isFinite(value) || value < 0 || value > 600_000) return null;
  if (!WEB_VITAL_RATINGS.has(rating)) return null;
  if (!NAVIGATION_TYPES.has(navigationType)) return null;
  if (
    route.length < 1 ||
    route.length > 200 ||
    !route.startsWith("/") ||
    route.includes("?") ||
    route.includes("#")
  ) {
    return null;
  }

  return {
    id,
    name: "web_vital",
    recordedAt: new Date(eventTime).toISOString(),
    props: { metric, value, rating, navigationType, route },
  };
}
