import { notFound } from "next/navigation";

export default function TestSafariPage() {
  // /test-safari 는 개발 전용. 프로덕션 응답은 next.config.ts redirects 가
  // 막지만, 빌드 산출물이 만에 하나 직접 노출돼도 404로 떨어지도록 이중 방어.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  // 30개의 카드 생성
  const cards = Array.from({ length: 30 }, (_, i) => i + 1);

  return (
    <div className="container" style={{ paddingTop: '16px', paddingBottom: '16px' }}>
      {cards.map((num) => (
        <div key={num} className="card">
          <div className="card-header">
            <h3 className="card-title">스크롤 테스트 카드 {num}</h3>
          </div>
          <p style={{ fontFamily: 'var(--v2-f-text)', fontSize: 13, color: 'var(--v2-ink-2)' }}>
            Safari 상/하단 바 뒤로 넘어가는지 관찰하세요. (Safe area 패딩이 미적용된 상태입니다.)
          </p>
        </div>
      ))}
    </div>
  );
}
