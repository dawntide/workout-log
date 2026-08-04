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
 * **`process.env.VERCEL` 가드를 두지 않는다.** 처음엔 뒀는데 프로덕션 배포 후 attach 로그도
 * 실패 로그도 찍히지 않았다(= 훅이 아예 안 걸렸다). 시스템 환경변수 자동 노출이 꺼진 프로젝트면
 * 런타임에 `VERCEL`이 없어 가드가 항상 조기 반환하는데, 그 가드가 없으면 애초에 생기지 않을
 * 실패 모드다. 대신 실측한 사실에 기댄다: `attachDatabasePool`은 **실제 pg Pool에 대해 Vercel
 * 밖에서도 예외 없이 no-op**이다(로컬 node로 확인). 그러니 조건 없이 등록하고 플랫폼 판단은
 * 패키지에 맡긴다 — 배선 여부는 아래 로그로 확인한다.
 */
export function registerVercelFluidPoolLifecycle(): void {
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
