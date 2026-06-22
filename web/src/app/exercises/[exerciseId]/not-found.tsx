import Link from "next/link";
import { APP_ROUTES } from "@/lib/app-routes";
import { V2Icon } from "@/components/v2/primitives/v2-icon";

export default function ExerciseDetailNotFound() {
  return (
    <div style={{ padding: "var(--v2-s-6)" }}>
      <div
        style={{
          background: "var(--v2-paper)",
          boxShadow: "var(--v2-elev-1)",
          borderRadius: "var(--v2-r-1)",
          padding: "var(--v2-s-5)",
          maxWidth: 480,
          margin: "0 auto",
          textAlign: "center",
          display: "grid",
          gap: "var(--v2-s-3)",
        }}
      >
        <V2Icon
          name="search_off"
          style={{ fontSize: "var(--v2-t-h1)", color: "var(--v2-ink-3)" }}
        />
        <h1
          className="v2-h2"
          style={{ fontSize: "var(--v2-t-20)", letterSpacing: 0, margin: 0 }}
        >
          운동을 찾을 수 없습니다
        </h1>
        <p className="v2-small v2-font-display" style={{ color: "var(--v2-ink-2)" }}>
          존재하지 않거나 접근할 수 없는 운동입니다. 통계 페이지로 돌아가
          다른 운동을 확인하세요.
        </p>
        <Link
          href={APP_ROUTES.statsHome}
          style={{
            display: "inline-flex",
            justifyContent: "center",
            padding: "var(--v2-s-3) var(--v2-s-4)",
            borderRadius: "var(--v2-r-1)",
            background: "var(--v2-accent)",
            color: "var(--v2-ink-on-accent)",
            fontWeight: 700,
            fontSize: "var(--v2-t-14)",
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
