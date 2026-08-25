/**
 * 체중 시계열 조회 — "그 세션 시점의 체중은 얼마였나".
 *
 * 앱은 지금 설정의 **단일 현재 체중**을 과거 데이터에 소급 적용한다(강도 점수의
 * 체중 대비 배율, asymptote 모니터의 PULL 노출 환산). 6개월 전 세션의 e1RM을 오늘
 * 체중으로 나누고 있으므로 체중이 변한 사용자에게는 지표가 틀린다.
 *
 * 순수 함수다 — DB·요청 컨텍스트 무지. 호출자가 사용자 기록을 한 번 읽어 여러 세션에
 * 대해 반복 호출한다(세션마다 쿼리를 날리지 않는다).
 */

export type BodyweightPoint = {
  measuredAt: Date;
  valueKg: number;
};

/** 입력을 시각 오름차순으로 정규화한다. 비유효 값은 버린다. */
export function normalizeBodyweightPoints(
  points: ReadonlyArray<{ measuredAt: Date | string; valueKg: number | string | null }>,
): BodyweightPoint[] {
  const out: BodyweightPoint[] = [];
  for (const point of points) {
    const measuredAt = point.measuredAt instanceof Date ? point.measuredAt : new Date(point.measuredAt);
    if (Number.isNaN(measuredAt.getTime())) continue;
    const valueKg = Number(point.valueKg);
    if (!Number.isFinite(valueKg) || valueKg <= 0) continue;
    out.push({ measuredAt, valueKg });
  }
  return out.sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
}

/**
 * `asOf` 이전(포함) 가장 최근 기록. 없으면 null — **호출자가 설정 단일값으로 폴백한다.**
 *
 * 첫 기록보다 이전 시점에 null을 주는 것이 의도다. 첫 기록 값을 뒤로 외삽하면
 * "기록을 시작하기 전의 체중"을 지어내는 셈이고, 그건 설정값 폴백이 할 일이다.
 *
 * 입력은 `normalizeBodyweightPoints`가 정렬한 배열을 전제한다.
 */
export function bodyweightAsOf(points: readonly BodyweightPoint[], asOf: Date): number | null {
  const target = asOf.getTime();
  if (Number.isNaN(target)) return null;

  // 오름차순 정렬 전제 → 이분 탐색으로 target 이하 마지막 인덱스를 찾는다.
  let low = 0;
  let high = points.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (points[mid]!.measuredAt.getTime() <= target) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found === -1 ? null : points[found]!.valueKg;
}

/**
 * 캐시 키에 넣을 이력 서명. 값이 바뀌면 문자열이 바뀐다.
 *
 * 체중 쓰기·삭제·설정 변경이 모두 `invalidateStatsCacheForUser`를 부르므로 지금은
 * 없어도 동작한다. 그래도 넣는 이유는 **의존을 키에 드러내기 위해서**다 — 원격
 * 무효화 호출 하나에 정확성이 걸려 있으면, 그 호출이 사라졌을 때 증상이
 * "지표가 안 바뀜"으로 조용히 나타난다.
 */
export function bodyweightTimelineSignature(points: readonly BodyweightPoint[]): string {
  if (points.length === 0) return "none";
  const latest = points[points.length - 1]!;
  return `${points.length}:${latest.measuredAt.getTime()}:${latest.valueKg}`;
}
