"use client";

import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import type { UserRole } from "@workout/core/db/schema";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";

export type MeUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  /** 관리자 전용 행의 노출 판단용. 실제 접근 경계는 서버가 잡는다(UI 숨김은 경계가 아니다). */
  role?: UserRole;
  fallback?: boolean;
} | null;

type MeResponse = { user: MeUser };
type SettingsResponse = { settings: SettingsSnapshot };

/**
 * 더보기 화면이 마운트 시 읽는 두 가지 — 계정(/api/auth/me)과 설정 스냅샷.
 * 둘 다 실패해도 화면은 그대로 뜨므로(계정 카드·행 기본값) 에러는 삼킨다.
 */
export function useMoreScreenData() {
  const [me, setMe] = useState<MeUser>(null);
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as MeResponse;
        if (!cancelled) setMe(body.user);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = await apiGet<SettingsResponse>("/api/settings");
        if (!cancelled) setSnapshot(body.settings);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { me, snapshot };
}
