import Link from "next/link";
import { APP_ROUTES } from "@/lib/app-routes";

export default function ExerciseDetailNotFound() {
  return (
    <div style={{ padding: "var(--v2-s-6)" }}>
      <div
        style={{
          background: "var(--v2-paper)",
          border: "1px solid var(--v2-hairline)",
          borderRadius: "var(--v2-r-1)",
          padding: "var(--v2-s-5)",
          maxWidth: 480,
          margin: "0 auto",
          textAlign: "center",
          display: "grid",
          gap: 12,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 32, color: "var(--v2-ink-3)" }}
          aria-hidden
        >
          search_off
        </span>
        <h1
          className="v2-h2"
          style={{ fontSize: 20, letterSpacing: 0, margin: 0 }}
        >
          운동을 찾을 수 없습니다
        </h1>
        <p className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
          존재하지 않거나 접근할 수 없는 운동입니다. 통계 페이지로 돌아가
          다른 운동을 확인하세요.
        </p>
        <Link
          href={APP_ROUTES.statsHome}
          style={{
            display: "inline-flex",
            justifyContent: "center",
            padding: "10px 16px",
            borderRadius: "var(--v2-r-1)",
            background: "var(--v2-accent)",
            color: "var(--v2-ink-on-accent)",
            fontFamily: "var(--v2-f-display)",
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
            margin: "0 auto",
          }}
        >
          통계로 이동
        </Link>
      </div>
    </div>
  );
}
