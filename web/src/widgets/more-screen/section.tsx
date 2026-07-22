import type { CSSProperties, ReactNode } from "react";

import { V2Card } from "@/components/v2/primitives";

/** 라벨 + 모서리만 둥근 카드 한 장에 행들을 붙이는 iOS Settings 패턴 그룹. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={{ padding: "var(--v2-s-3) 0px 0px" }}>
      <div className="v2-label" style={{ padding: "0px var(--v2-s-2) var(--v2-s-1)" }}>
        {title}
      </div>
      <V2Card
        padding={0}
        radius="var(--v2-r-3)"
        style={{
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          ["--v2-nav-row-radius" as string]: "0",
        } as CSSProperties}
      >
        {children}
      </V2Card>
    </div>
  );
}
