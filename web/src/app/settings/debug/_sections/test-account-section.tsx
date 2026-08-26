"use client";

import { useState } from "react";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { useLocale } from "@/components/locale-provider";
import { NoticeStateRows } from "@/components/ui/settings-state";
import { V2NavRow } from "@/components/v2/primitives";
import {
  V2SettingsFootnote,
  V2SettingsGroup,
  V2SettingsSection,
} from "@/components/v2/settings/section";
import { errorMessage } from "@/lib/error-message";
import { clearClientStateForAccountSwitch } from "@/lib/local-app-state";

/**
 * 관리자 전용 — 테스트 계정으로 전환하는 진입점.
 *
 * 복귀는 여기 두지 않는다. 전환하는 순간 role이 test가 되어 이 페이지 자체가 404라,
 * 돌아갈 길은 전 화면에 뜨는 배너(V2ImpersonationBanner)에 있다.
 */
export function TestAccountSection() {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const { confirm } = useAppDialog();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchToTestAccount = async () => {
    if (switching) return;
    const confirmed = await confirm({
      title: ko ? "테스트 계정으로 전환할까요?" : "Switch to the test account?",
      message: ko
        ? "이 브라우저가 별도의 테스트 계정으로 바뀝니다. 실제 기록은 그대로 두고, 배너의 돌아가기로 언제든 복귀할 수 있습니다."
        : "This browser switches to a separate test account. Your real data is untouched, and the banner returns you at any time.",
      confirmText: ko ? "전환" : "Switch",
      cancelText: ko ? "취소" : "Cancel",
      tone: "default",
    });
    if (!confirmed) return;

    try {
      setSwitching(true);
      setError(null);
      const res = await fetch("/api/admin/impersonate", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? (ko ? "전환에 실패했습니다." : "Failed to switch."));
        setSwitching(false);
        return;
      }
      // 계정이 바뀌므로 이전 계정의 캐시를 **끝까지 지운 뒤** 리로드한다. 기다리지 않으면
      // 웜업이 관리자 데이터를 테스트 계정 화면에 복원한다.
      await clearClientStateForAccountSwitch();
      window.location.href = "/";
    } catch (err) {
      setError(errorMessage(err) ?? (ko ? "네트워크 오류" : "Network error"));
      setSwitching(false);
    }
  };

  return (
    <div>
      <section>
        <V2SettingsSection title={ko ? "테스트 계정" : "Test account"} />
        <V2SettingsGroup ariaLabel={ko ? "테스트 계정 전환" : "Test account switch"}>
          <V2NavRow
            label={ko ? "테스트 계정으로 전환" : "Switch to test account"}
            description={
              switching
                ? ko
                  ? "전환 중…"
                  : "Switching…"
                : ko
                  ? "운영 환경에서 실데이터를 건드리지 않고 테스트합니다"
                  : "Test against production without touching real data"
            }
            onClick={() => {
              void switchToTestAccount();
            }}
            disabled={switching}
          />
        </V2SettingsGroup>
        <V2SettingsFootnote>
          {ko
            ? "전용 테스트 계정으로 세션이 바뀝니다. 이 계정은 비밀번호 로그인이 불가능하고, 이 전환으로만 접근됩니다."
            : "Your session switches to a dedicated test account. It cannot be signed into with a password — this switch is the only way in."}
        </V2SettingsFootnote>
      </section>

      {error && (
        <section>
          <NoticeStateRows
            message={error}
            tone="warning"
            label={ko ? "오류" : "Error"}
          />
        </section>
      )}
    </div>
  );
}
