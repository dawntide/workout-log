import type { MuscleGroup } from "@workout/core/muscle-groups/category-to-muscle";

/**
 * 근육군 표시 라벨.
 *
 * 홈의 볼륨 카드와 통계의 신선도 카드가 **같은 이름을 써야 한다** — 한쪽이 "대퇴사두",
 * 다른 쪽이 "허벅지 앞"이면 같은 부위인지 알 수 없다. 그래서 위젯이 각자 갖지 않고
 * 여기 한 벌만 둔다.
 */
export const MUSCLE_GROUP_LABEL_KO: Record<MuscleGroup, string> = {
  Quad: "대퇴사두",
  Hamstring: "햄스트링",
  Glute: "둔근",
  Back: "등",
  Chest: "가슴",
  Shoulder: "어깨",
  Arm: "팔",
  Core: "코어",
  Other: "기타",
};

export const MUSCLE_GROUP_LABEL_EN: Record<MuscleGroup, string> = {
  Quad: "Quads",
  Hamstring: "Hamstrings",
  Glute: "Glutes",
  Back: "Back",
  Chest: "Chest",
  Shoulder: "Shoulders",
  Arm: "Arms",
  Core: "Core",
  Other: "Other",
};

export function muscleGroupLabel(group: string, locale: "ko" | "en"): string {
  const labels = locale === "ko" ? MUSCLE_GROUP_LABEL_KO : MUSCLE_GROUP_LABEL_EN;
  return labels[group as MuscleGroup] ?? group;
}
