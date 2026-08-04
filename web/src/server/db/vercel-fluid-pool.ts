import { attachDatabasePool } from "@vercel/functions";
import { setDbPoolLifecycleHook } from "@workout/core/db/client";
import { logInfo } from "@workout/core/observability/logger";

/**
 * Fluid Compute용 pg 풀 수명 배선 (web 전용 어댑터).
 *
 * Fluid는 요청이 끝나면 인스턴스를 죽이지 않고 **일시 중단**했다가 다음 요청에 재개한다.
 * 이때 pg 풀이 유휴 클라이언트를 붙들고 있으면 중단 구간 동안 죽은 TCP 연결이 남고, 재개 후
 * 그 커넥션을 집어 든 쿼리가 실패하거나 Supabase 풀러 슬롯이 낭비된다. `attachDatabasePool`은
 * 중단 직전에 유휴 클라이언트를 놓아주도록 풀에 수명 훅을 건다.
 *
 * core에 직접 넣지 않는 이유: `packages/core`는 실행 플랫폼 무지가 규칙이고(같은 코드가
 * VPS의 apps/api에서도 돈다), `@vercel/functions`는 Vercel 전용이다. 그래서 core는 훅
 * 주입점만 열어두고 배선은 여기(web)서 한다 — 쿠키·OAuth 어댑터가 web에 남아 있는 것과 같다.
 *
 * `VERCEL` 가드: 로컬 dev·CI·VPS에서는 일시 중단이 없어 배선이 불필요하다(무해하지만 의미 없음).
 */
export function registerVercelFluidPoolLifecycle(): void {
  if (!process.env.VERCEL) return;
  setDbPoolLifecycleHook((pool) => {
    // 실패해도 앱은 정상 동작해야 한다 — 최적화이지 필수 경로가 아니다.
    try {
      attachDatabasePool(pool);
      // 배선은 눈에 보이지 않는 최적화라 켜졌는지 확인할 방법이 필요하다. 풀 생성은
      // 인스턴스당 1회뿐이라(전역 재사용) 콜드 스타트마다 한 줄이고, 이게 없으면
      // 프로덕션에서 동작 여부를 사후에 알 길이 없다.
      logInfo("db.fluid_pool_attached", {});
    } catch (error) {
      logInfo("db.fluid_pool_attach_failed", { error: String(error) });
    }
  });
}
