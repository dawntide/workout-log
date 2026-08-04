/**
 * Next.js 서버 부트스트랩 훅 — 요청 처리 전에 한 번 실행된다.
 *
 * 여기서 Fluid Compute용 pg 풀 수명 배선을 등록한다. 풀은 첫 쿼리에 지연 생성되므로
 * 이 시점이면 항상 생성 이전이고, 늦게 등록돼도 core가 기존 풀에 즉시 적용한다.
 */
export async function register(): Promise<void> {
  // edge 런타임엔 pg 풀이 없다(그리고 node 전용 모듈을 import할 수 없다).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerVercelFluidPoolLifecycle } = await import(
    "@/server/db/vercel-fluid-pool"
  );
  registerVercelFluidPoolLifecycle();
}
