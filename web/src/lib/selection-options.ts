import { EXERCISE_NAMES } from "@workout/core/exercise/catalog";

export type SelectionOptionSeed = {
  value: string;
  label: string;
  description?: string;
  keywords?: string[];
};

export const commonTimezoneOptions: SelectionOptionSeed[] = [
  { value: "UTC", label: "UTC", description: "Coordinated Universal Time", keywords: ["gmt", "zulu"] },
  { value: "Asia/Seoul", label: "Asia/Seoul", description: "Korea Standard Time", keywords: ["kst", "seoul"] },
  { value: "Asia/Tokyo", label: "Asia/Tokyo", description: "Japan Standard Time", keywords: ["jst", "tokyo"] },
  { value: "Asia/Singapore", label: "Asia/Singapore", description: "Singapore Time", keywords: ["sgt"] },
  { value: "Europe/London", label: "Europe/London", description: "United Kingdom", keywords: ["bst", "gmt", "uk"] },
  { value: "Europe/Berlin", label: "Europe/Berlin", description: "Central Europe", keywords: ["cet", "cest", "germany"] },
  { value: "Europe/Paris", label: "Europe/Paris", description: "France", keywords: ["cet", "france"] },
  { value: "America/New_York", label: "America/New_York", description: "US Eastern Time", keywords: ["est", "edt", "nyc"] },
  { value: "America/Chicago", label: "America/Chicago", description: "US Central Time", keywords: ["cst", "cdt"] },
  { value: "America/Denver", label: "America/Denver", description: "US Mountain Time", keywords: ["mst", "mdt"] },
  { value: "America/Los_Angeles", label: "America/Los_Angeles", description: "US Pacific Time", keywords: ["pst", "pdt", "la"] },
  { value: "America/Phoenix", label: "America/Phoenix", description: "US Arizona", keywords: ["mst", "arizona"] },
  { value: "America/Anchorage", label: "America/Anchorage", description: "US Alaska", keywords: ["akst"] },
  { value: "Pacific/Honolulu", label: "Pacific/Honolulu", description: "US Hawaii", keywords: ["hst", "hawaii"] },
  { value: "Australia/Sydney", label: "Australia/Sydney", description: "Australia Eastern", keywords: ["aest", "sydney"] },
  { value: "Australia/Perth", label: "Australia/Perth", description: "Australia Western", keywords: ["awst"] },
];

export const statsPlanScopeOptions: SelectionOptionSeed[] = [
  { value: "all", label: "All Plans", description: "Aggregate metrics across every plan." },
  { value: "single", label: "Single Plan", description: "Focus on single-root plan data." },
  { value: "composite", label: "Composite Plan", description: "Focus on hybrid/composite plans." },
  { value: "manual", label: "Manual Plan", description: "Focus on manual session templates." },
];

export const statsMetricOptions: SelectionOptionSeed[] = [
  { value: "e1rm", label: "e1RM", description: "Estimated one-rep max trend and records." },
  { value: "volume", label: "Volume", description: "Tonnage, set, and rep totals." },
  { value: "prs", label: "PR Tracking", description: "Best and latest PR deltas." },
];

export const commonExerciseOptions: SelectionOptionSeed[] = [
  { value: EXERCISE_NAMES.highBarBackSquat, label: EXERCISE_NAMES.highBarBackSquat, keywords: ["squat", "high bar", "하이바"] },
  { value: EXERCISE_NAMES.lowBarBackSquat, label: EXERCISE_NAMES.lowBarBackSquat, keywords: ["squat", "low bar", "로우바"] },
  { value: EXERCISE_NAMES.frontSquat, label: EXERCISE_NAMES.frontSquat, keywords: ["squat", "front", "프론트"] },
  { value: "Bench Press", label: "Bench Press", keywords: ["bench", "chest"] },
  { value: "Incline Bench Press", label: "Incline Bench Press", keywords: ["bench", "incline"] },
  { value: "Overhead Press", label: "Overhead Press", keywords: ["press", "ohp"] },
  { value: "Deadlift", label: "Deadlift", keywords: ["deadlift"] },
  { value: "Romanian Deadlift", label: "Romanian Deadlift", keywords: ["rdl", "deadlift"] },
  { value: "Barbell Row", label: "Barbell Row", keywords: ["row", "back"] },
  { value: "Pull Up", label: "Pull Up", keywords: ["pull", "lat"] },
  { value: "Lat Pulldown", label: "Lat Pulldown", keywords: ["pull", "lat"] },
  { value: "Dumbbell Row", label: "Dumbbell Row", keywords: ["row", "db"] },
  { value: "Dip", label: "Dip", keywords: ["triceps", "chest"] },
  { value: "Lunge", label: "Lunge", keywords: ["leg"] },
  { value: "Leg Press", label: "Leg Press", keywords: ["quad", "leg"] },
  { value: "Leg Curl", label: "Leg Curl", keywords: ["hamstring", "leg"] },
  { value: "Calf Raise", label: "Calf Raise", keywords: ["calf"] },
  { value: "Face Pull", label: "Face Pull", keywords: ["rear delt", "pull"] },
  { value: "Biceps Curl", label: "Biceps Curl", keywords: ["curl", "biceps"] },
  { value: "Triceps Extension", label: "Triceps Extension", keywords: ["triceps"] },
];

