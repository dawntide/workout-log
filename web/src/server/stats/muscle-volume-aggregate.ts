import { resolveLoggedTotalLoadKg } from "@/lib/bodyweight-load";
import {
  MUSCLE_GROUPS,
  type MuscleGroup,
  resolveMuscleContribution,
  resolvePrimaryMuscleGroup,
} from "@/lib/muscle-groups/category-to-muscle";

export type MuscleVolumeWeekPoint = {
  weekStart: string;
  muscleGroup: MuscleGroup;
  tonnageKg: number;
  setCount: number;
};

export type MuscleVolumeTotal = {
  muscleGroup: MuscleGroup;
  tonnageKg: number;
  setCount: number;
};

export type MuscleVolumeInputRow = {
  weekStart: string;
  exerciseName: string;
  category: string | null;
  weightKg: number | null;
  reps: number | null;
  meta?: Record<string, unknown> | null;
};

function roundKg(value: number): number {
  return Math.round(value * 10) / 10;
}

export function aggregateMuscleVolumeRows(rows: MuscleVolumeInputRow[]): {
  weekly: MuscleVolumeWeekPoint[];
  totals: MuscleVolumeTotal[];
} {
  type Aggregate = { tonnageKg: number; setCount: number };
  const weekMap = new Map<string, Map<MuscleGroup, Aggregate>>();
  const totalsMap = new Map<MuscleGroup, Aggregate>();

  for (const row of rows) {
    const exerciseName = String(row.exerciseName ?? "");
    if (!exerciseName) continue;
    const reps = Number(row.reps ?? 0);
    if (reps <= 0) continue;

    const weightKg = resolveLoggedTotalLoadKg({
      exerciseName,
      weightKg: row.weightKg,
      meta: row.meta,
    });
    const tonnage = (weightKg ?? 0) * reps;

    const contribution = resolveMuscleContribution(exerciseName, row.category);
    const primary = resolvePrimaryMuscleGroup(exerciseName, row.category);
    const weekStart = String(row.weekStart);

    let perWeek = weekMap.get(weekStart);
    if (!perWeek) {
      perWeek = new Map<MuscleGroup, Aggregate>();
      weekMap.set(weekStart, perWeek);
    }

    for (const group of MUSCLE_GROUPS) {
      const weight = contribution[group];
      if (weight === undefined || weight <= 0) continue;
      const tonnageContribution = tonnage * weight;
      const weekEntry = perWeek.get(group) ?? { tonnageKg: 0, setCount: 0 };
      weekEntry.tonnageKg += tonnageContribution;
      perWeek.set(group, weekEntry);
      const totalEntry = totalsMap.get(group) ?? { tonnageKg: 0, setCount: 0 };
      totalEntry.tonnageKg += tonnageContribution;
      totalsMap.set(group, totalEntry);
    }

    const weekPrimary = perWeek.get(primary) ?? { tonnageKg: 0, setCount: 0 };
    weekPrimary.setCount += 1;
    perWeek.set(primary, weekPrimary);
    const totalPrimary = totalsMap.get(primary) ?? { tonnageKg: 0, setCount: 0 };
    totalPrimary.setCount += 1;
    totalsMap.set(primary, totalPrimary);
  }

  const weekly: MuscleVolumeWeekPoint[] = [];
  for (const [weekStart, groupMap] of weekMap.entries()) {
    for (const [muscleGroup, agg] of groupMap.entries()) {
      weekly.push({
        weekStart,
        muscleGroup,
        tonnageKg: roundKg(agg.tonnageKg),
        setCount: agg.setCount,
      });
    }
  }
  weekly.sort((a, b) =>
    a.weekStart === b.weekStart
      ? MUSCLE_GROUPS.indexOf(a.muscleGroup) - MUSCLE_GROUPS.indexOf(b.muscleGroup)
      : a.weekStart.localeCompare(b.weekStart),
  );

  const totals: MuscleVolumeTotal[] = [];
  for (const group of MUSCLE_GROUPS) {
    const agg = totalsMap.get(group);
    if (!agg || (agg.tonnageKg <= 0 && agg.setCount <= 0)) continue;
    totals.push({
      muscleGroup: group,
      tonnageKg: roundKg(agg.tonnageKg),
      setCount: agg.setCount,
    });
  }
  totals.sort((a, b) => b.tonnageKg - a.tonnageKg);

  return { weekly, totals };
}
