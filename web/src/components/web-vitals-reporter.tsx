"use client";

import { useReportWebVitals } from "next/web-vitals";

import { trackWorkoutUxEvent } from "@/lib/workout-ux-events";

type WebVitalMetric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

// Keep the callback identity stable so the reporter is never re-registered on
// an incidental parent render.
function reportWebVital(metric: WebVitalMetric) {
  trackWorkoutUxEvent("web_vital", {
    id: metric.id,
    metric: metric.name,
    value: Math.round(metric.value * 100) / 100,
    rating: metric.rating,
    navigationType: metric.navigationType,
    route: window.location.pathname,
  });
}

/** Collect real-user Core Web Vitals through the existing durable UX stream. */
export function WebVitalsReporter() {
  useReportWebVitals(reportWebVital);

  return null;
}
