"use client";

import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";

export type MeUser = {
  id: string;
  email: string | null;
  displayName: string | null;
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
