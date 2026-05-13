"use client";

import { useState } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  BaseGroupedList,
  InfoRow,
  NavigationRow,
  RowIcon,
  SectionFootnote,
  SectionHeader,
  SubtitleRow,
  ToggleRow,
  ValueRow,
} from "./settings-list";
import { settingsListTokenDefaults } from "./settings-list.tokens";
import { DisabledStateRows, EmptyStateRows, ErrorStateRows, LoadingStateRows } from "./settings-state";

export function SettingsListExample() {
  const { locale } = useLocale();
  const [wifiEnabled, setWifiEnabled] = useState(true);
  const [cellularEnabled, setCellularEnabled] = useState(true);
  const [showLoading, setShowLoading] = useState(false);

  return (
    <div>
      <SectionHeader title={locale === "ko" ? "연결" : "Connectivity"} />
      <BaseGroupedList ariaLabel={locale === "ko" ? "연결 설정 예시" : "Connectivity settings example"}>
        <ToggleRow
          label="Wi-Fi"
          subtitle={locale === "ko" ? "기본 네트워크" : "Primary network"}
          description={wifiEnabled ? (locale === "ko" ? "Home-5G에 연결됨" : "Connected to Home-5G") : (locale === "ko" ? "꺼짐" : "Off")}
          checked={wifiEnabled}
          onCheckedChange={setWifiEnabled}
          leading={<RowIcon symbol="WF" tone="info" />}
        />
        <ToggleRow
          label={locale === "ko" ? "셀룰러 데이터" : "Cellular Data"}
          checked={cellularEnabled}
          onCheckedChange={setCellularEnabled}
          leading={<RowIcon symbol="CL" tone="success" />}
        />
        <ValueRow label="VPN" value={locale === "ko" ? "연결 안 됨" : "Not connected"} leading={<RowIcon symbol="VP" tone="neutral" />} />
        <SubtitleRow
          label={locale === "ko" ? "개인용 핫스팟" : "Personal Hotspot"}
          subtitle={locale === "ko" ? "테더링" : "Tethering"}
          value={locale === "ko" ? "꺼짐" : "Off"}
          href="/system/app"
          leading={<RowIcon symbol="HS" tone="warning" />}
          badge="NEW"
          badgeTone="metric"
        />
      </BaseGroupedList>
      <SectionFootnote>{locale === "ko" ? "예시는 공통 행 조합만 보여줍니다." : "This example shows common row combinations only."}</SectionFootnote>

      <SectionHeader title={locale === "ko" ? "상태" : "Status"} />
      <BaseGroupedList
        ariaLabel={locale === "ko" ? "상태 설정 예시" : "Status settings example"}
        tokens={{
          ...settingsListTokenDefaults,
          "--settings-group-background": "color-mix(in srgb, var(--v2-paper) 90%, transparent)",
        }}
      >
        <InfoRow
          label={locale === "ko" ? "동기화" : "Sync"}
          description={locale === "ko" ? "2분 전에 동기화됨" : "Synced 2 minutes ago"}
          value={locale === "ko" ? "정상" : "Healthy"}
          tone="success"
          leading={<RowIcon symbol="SY" tone="success" />}
        />
        <InfoRow
          label={locale === "ko" ? "오프라인 대기열" : "Offline Queue"}
          description={locale === "ko" ? "운동 로그 2건 대기" : "2 workout logs are pending"}
          value={locale === "ko" ? "확인 필요" : "Needs review"}
          tone="warning"
          leading={<RowIcon symbol="Q" tone="warning" />}
          badge="!"
          badgeTone="warning"
        />
        <NavigationRow
          label={showLoading ? (locale === "ko" ? "로딩 예시 숨기기" : "Hide Loading Example") : (locale === "ko" ? "로딩 예시 보기" : "Show Loading Example")}
          description={locale === "ko" ? "지연 뒤 로딩 행이 표시됩니다." : "A loading row appears after a short delay."}
          onPress={() => setShowLoading((prev) => !prev)}
          leading={<RowIcon symbol="LD" tone="info" />}
        />
      </BaseGroupedList>
      <SectionFootnote>{locale === "ko" ? "모든 행은 같은 높이와 좌우 패딩을 사용합니다." : "All rows use the same height and horizontal padding."}</SectionFootnote>

      <SectionHeader title={locale === "ko" ? "상태 행" : "State Rows"} />
      <LoadingStateRows active={showLoading} />
      <EmptyStateRows when label={locale === "ko" ? "설정 값 없음" : "No items available"} description={locale === "ko" ? "샘플 환경에서 표시할 값이 없습니다." : "There are no values to show in this sample state."} />
      <ErrorStateRows message={locale === "ko" ? "샘플 오류 메시지입니다." : "This is a sample error message."} onRetry={() => setShowLoading(false)} />
      <DisabledStateRows when label={locale === "ko" ? "현재 사용할 수 없음" : "Currently unavailable"} description={locale === "ko" ? "선행 설정 완료 후 다시 시도하세요." : "Try again after the prerequisite setup is complete."} />
      <SectionFootnote>{locale === "ko" ? "로딩, 빈 상태, 오류, 비활성 패턴을 공통 규칙으로 제공합니다." : "Loading, empty, error, and disabled patterns all follow the same shared rules."}</SectionFootnote>
    </div>
  );
}
