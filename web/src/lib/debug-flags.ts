/**
 * 전환(테스트 계정) 세션에서만 쓰는 임시 디버그 스위치.
 *
 * **메모리에만 산다.** localStorage에 두면 켠 채로 잊고 관리자로 돌아갔을 때 실계정 저장이
 * 실패하기 시작한다 — 원인을 모르면 진짜 버그로 보인다. 탭을 새로 열면 사라지는 편이
 * 안전하고, 알약과 기록 화면은 같은 SPA 세션이라 메모리만으로 충분하다.
 */

/**
 * "다음 저장 1회 실패". 토글이 아니라 **일회용**이다 — 켠 채로 두면 왜 저장이 안 되는지
 * 잊게 되므로, 한 번 소비되면 스스로 꺼진다(설정 저장 시뮬레이션과 같은 계약).
 */
let nextSaveFailureArmed = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function isNextSaveFailureArmed(): boolean {
  return nextSaveFailureArmed;
}

export function setNextSaveFailureArmed(armed: boolean): void {
  if (nextSaveFailureArmed === armed) return;
  nextSaveFailureArmed = armed;
  notify();
}

/** 무장돼 있으면 true를 돌려주고 즉시 해제한다. 저장 경로가 이걸 부른다. */
export function consumeNextSaveFailure(): boolean {
  if (!nextSaveFailureArmed) return false;
  nextSaveFailureArmed = false;
  notify();
  return true;
}

export function subscribeDebugFlags(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 시뮬레이션임이 드러나는 문구. 진짜 장애와 구분되지 않으면 디버깅 도구가 오히려
 * 사람을 속인다.
 */
export const SIMULATED_SAVE_FAILURE_MESSAGE =
  "저장 실패를 시뮬레이션했습니다 (디버그 도구)";
