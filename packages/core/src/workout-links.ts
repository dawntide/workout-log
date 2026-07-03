export function toLocalDateKey(date: Date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildTodayLogHref({
  planId,
  date = toLocalDateKey(),
  logId,
}: {
  planId?: string | null;
  date?: string;
  logId?: string | null;
  autoGenerate?: boolean;
}) {
  const params = new URLSearchParams();
  if (planId) params.set("planId", planId);
  params.set("date", date);
  if (logId) params.set("logId", logId);
  const query = params.toString();
  return `/workout/log${query ? `?${query}` : ""}`;
}
