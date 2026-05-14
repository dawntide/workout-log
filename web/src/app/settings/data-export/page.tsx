"use client";

import { useMemo, useRef, useState } from "react";
import { V2NavRow } from "@/components/v2/primitives";
import {
  V2SettingsFootnote,
  V2SettingsGroup,
  V2SettingsSection,
  mergeRowSubtitle,
} from "@/components/v2/settings/section";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { useLocale } from "@/components/locale-provider";
import { NoticeStateRows } from "@/components/ui/settings-state";
import { V2SecondaryBtn } from "@/components/v2/primitives";
import { apiInvalidateCache } from "@/lib/api";

type ExportFormat = "json" | "csv";

type ImportSummaryItem = {
  table: string;
  willDelete: number;
  willInsert: number;
};

type ImportResponse = {
  applied: boolean;
  mode: "dryRun" | "replace";
  schemaVersion: number;
  exportedAt: string;
  summary: ImportSummaryItem[];
  warnings: string[];
};

function buildExportPath(format: ExportFormat) {
  if (format === "csv") {
    return "/api/export?format=csv&type=workout_set";
  }
  return "/api/export?format=json";
}

function buildFileName(format: ExportFormat) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return format === "csv" ? `workout-log-workout_set-${stamp}.csv` : `workout-log-export-${stamp}.json`;
}

async function shareOrDownloadExport(
  path: string,
  format: ExportFormat,
  copy: ReturnType<typeof useLocale>["copy"],
) {
  const response = await fetch(path, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error ?? copy.settings.dataExportPage.exportFailed(response.status));
  }

  const blob = await response.blob();
  const fileName = buildFileName(format);
  const mimeType = format === "csv" ? "text/csv" : "application/json";
  const file = new File([blob], fileName, { type: mimeType });

  if (typeof navigator !== "undefined" && "share" in navigator && "canShare" in navigator) {
    const sharePayload = {
      title: copy.settings.dataExportPage.shareTitle,
      text: copy.settings.dataExportPage.shareText,
      files: [file],
    };
    try {
      const canShare = (navigator as Navigator & { canShare?: (data?: ShareData) => boolean }).canShare;
      if (canShare?.(sharePayload)) {
        await (navigator as Navigator & { share: (data?: ShareData) => Promise<void> }).share(sharePayload);
        return "shared";
      }
    } catch {
      // Fallback to local download.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 600);
  return "downloaded";
}

async function postImport(
  mode: "dryRun" | "replace",
  data: unknown,
): Promise<ImportResponse> {
  const body: Record<string, unknown> = { mode, data };
  if (mode === "replace") body.confirmToken = "REPLACE_USER_DATA";
  const response = await fetch("/api/me/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error ?? `import failed (${response.status})`);
  }
  return payload as ImportResponse;
}

export default function SettingsDataExportPage() {
  const { copy, locale } = useLocale();
  const { confirm, alert } = useAppDialog();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importBusy, setImportBusy] = useState<"idle" | "loading" | "applying">(
    "idle",
  );
  const [importedFile, setImportedFile] = useState<{
    name: string;
    payload: unknown;
  } | null>(null);
  const [importPreview, setImportPreview] = useState<ImportResponse | null>(
    null,
  );

  const exportingLabel = useMemo(() => {
    if (!exporting) return null;
    return exporting === "json"
      ? copy.settings.dataExportPage.json.exporting
      : copy.settings.dataExportPage.csv.exporting;
  }, [copy.settings.dataExportPage.csv.exporting, copy.settings.dataExportPage.json.exporting, exporting]);

  const runExport = async (format: ExportFormat) => {
    try {
      setExporting(format);
      setError(null);
      setNotice(null);
      const result = await shareOrDownloadExport(buildExportPath(format), format, copy);
      if (result === "shared") {
        setNotice(format === "json" ? copy.settings.dataExportPage.json.shared : copy.settings.dataExportPage.csv.shared);
      } else {
        setNotice(format === "json" ? copy.settings.dataExportPage.json.downloaded : copy.settings.dataExportPage.csv.downloaded);
      }
    } catch (e: any) {
      setError(e?.message ?? copy.settings.dataExportPage.genericError);
    } finally {
      setExporting(null);
    }
  };

  const handleFilePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow picking the same file again
    if (!file) return;
    try {
      setImportBusy("loading");
      setError(null);
      setNotice(null);
      setImportPreview(null);
      const text = await file.text();
      const json = JSON.parse(text);
      setImportedFile({ name: file.name, payload: json });
      const preview = await postImport("dryRun", json);
      setImportPreview(preview);
    } catch (e: any) {
      setImportedFile(null);
      setImportPreview(null);
      setError(
        e?.message ??
          (locale === "ko"
            ? "import 파일을 읽지 못했습니다."
            : "Failed to read import file."),
      );
    } finally {
      setImportBusy("idle");
    }
  };

  const runReplace = async () => {
    if (!importedFile || !importPreview) return;
    const confirmed = await confirm({
      title: locale === "ko" ? "데이터 교체" : "Replace Data",
      message:
        locale === "ko"
          ? "현재 계정의 운동 기록, 세트, 플랜, 커스텀 템플릿이 삭제되고 import 파일 내용으로 교체됩니다.\n\n이 작업은 복구할 수 없습니다. 계속하시겠습니까?"
          : "Your current logs, sets, plans, and custom templates will be deleted and replaced with the import file contents.\n\nThis action cannot be undone. Continue?",
      confirmText: locale === "ko" ? "교체" : "Replace",
      cancelText: locale === "ko" ? "취소" : "Cancel",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      setImportBusy("applying");
      setError(null);
      setNotice(null);
      const applied = await postImport("replace", importedFile.payload);
      apiInvalidateCache();
      setImportPreview(applied);
      setNotice(
        locale === "ko"
          ? "데이터를 import 파일로 교체했습니다."
          : "Data was replaced with the import file.",
      );
      await alert({
        title: locale === "ko" ? "Import 완료" : "Import Complete",
        message:
          locale === "ko"
            ? "데이터 교체가 완료되었습니다. 화면을 새로고침해 변경 내용을 반영하세요."
            : "Data replacement is complete. Refresh to see updates across the app.",
      });
    } catch (e: any) {
      setError(
        e?.message ??
          (locale === "ko" ? "Import 적용에 실패했습니다." : "Failed to apply import."),
      );
      await alert({
        title: locale === "ko" ? "Import 실패" : "Import Failed",
        message:
          e?.message ??
          (locale === "ko" ? "import 적용에 실패했습니다." : "Failed to apply import."),
        tone: "danger",
      });
    } finally {
      setImportBusy("idle");
    }
  };

  const importSummaryRows = importPreview?.summary.filter(
    (row) => row.willDelete > 0 || row.willInsert > 0,
  );

  return (
    <div>
      <NoticeStateRows message={notice} tone="success" label={copy.settings.dataExportPage.noticeSuccess} />
      <NoticeStateRows message={error} tone="warning" label={copy.settings.dataExportPage.noticeError} />

      <section>
        <V2SettingsSection title={copy.settings.dataExportPage.title} description={copy.settings.dataExportPage.description} />
        <V2SettingsGroup ariaLabel={copy.settings.dataExportPage.ariaLabel}>
          <V2NavRow
            label={copy.settings.dataExportPage.json.label}
            description={mergeRowSubtitle(
              copy.settings.dataExportPage.json.subtitle,
              copy.settings.dataExportPage.json.description,
            )}
            value={exporting === "json" ? copy.settings.dataExportPage.actionInProgress : copy.settings.dataExportPage.actionShare}
            onClick={() => {
              void runExport("json");
            }}
            disabled={Boolean(exporting)}
          />
          <V2NavRow
            label={copy.settings.dataExportPage.csv.label}
            description={mergeRowSubtitle(
              copy.settings.dataExportPage.csv.subtitle,
              copy.settings.dataExportPage.csv.description,
            )}
            value={exporting === "csv" ? copy.settings.dataExportPage.actionInProgress : copy.settings.dataExportPage.actionShare}
            onClick={() => {
              void runExport("csv");
            }}
            disabled={Boolean(exporting)}
          />
        </V2SettingsGroup>
        <V2SettingsFootnote>
          {copy.settings.dataExportPage.footnote}
        </V2SettingsFootnote>
      </section>

      {exportingLabel ? (
        <section>
          <div style={{ background: "var(--v2-paper)", borderRadius: "var(--v2-r-4)", padding: "var(--v2-s-4)", boxShadow: "0 1px 3px var(--shadow-color-soft)" }}>
            <p className="v2-font-display" style={{ margin: 0, fontSize: 13, color: "var(--v2-ink-2)" }}>{exportingLabel}</p>
          </div>
        </section>
      ) : null}

      <section>
        <V2SettingsSection
          title={locale === "ko" ? "Import (백업 복원)" : "Import (Restore Backup)"}
          description={
            locale === "ko"
              ? "JSON export 파일을 선택하면 dry-run으로 변경 내역을 미리 보고, 확인 후 교체합니다."
              : "Pick a JSON export file to preview the change set, then confirm to replace your data."
          }
        />
        <V2SettingsGroup
          ariaLabel={locale === "ko" ? "Import 작업" : "Import actions"}
        >
          <V2NavRow
            label={
              importedFile
                ? locale === "ko"
                  ? `선택된 파일: ${importedFile.name}`
                  : `Selected file: ${importedFile.name}`
                : locale === "ko"
                  ? "JSON 파일 선택"
                  : "Pick JSON File"
            }
            description={mergeRowSubtitle(
              "Backup",
              locale === "ko"
                ? "schemaVersion이 호환되지 않으면 거부됩니다."
                : "Files with an incompatible schemaVersion are rejected.",
            )}
            value={
              importBusy === "loading"
                ? locale === "ko"
                  ? "읽는 중..."
                  : "Reading..."
                : locale === "ko"
                  ? "선택"
                  : "Pick"
            }
            onClick={() => importInputRef.current?.click()}
            disabled={importBusy !== "idle"}
          />
          {importPreview ? (
            <V2NavRow
              as="div"
              label={
                locale === "ko"
                  ? `Schema v${importPreview.schemaVersion}`
                  : `Schema v${importPreview.schemaVersion}`
              }
              description={
                importPreview.exportedAt
                  ? locale === "ko"
                    ? `Export 시각: ${new Date(importPreview.exportedAt).toLocaleString("ko-KR")}`
                    : `Exported at: ${new Date(importPreview.exportedAt).toLocaleString("en-US")}`
                  : ""
              }
              value={
                importPreview.applied
                  ? locale === "ko"
                    ? "적용됨"
                    : "Applied"
                  : locale === "ko"
                    ? "Dry-run"
                    : "Dry-run"
              }
              trailing="none"
            />
          ) : null}
        </V2SettingsGroup>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            void handleFilePicked(e);
          }}
        />

        {importSummaryRows && importSummaryRows.length > 0 ? (
          <V2SettingsGroup
            ariaLabel={
              locale === "ko" ? "Import 변경 요약" : "Import change summary"
            }
            
          >
            {importSummaryRows.map((row) => (
              <V2NavRow
                key={row.table}
                label={row.table}
                description={
                  locale === "ko"
                    ? `삭제 ${row.willDelete} → 삽입 ${row.willInsert}`
                    : `delete ${row.willDelete} → insert ${row.willInsert}`
                }
                value={
                  importPreview?.applied
                    ? locale === "ko"
                      ? "완료"
                      : "Done"
                    : locale === "ko"
                      ? "예정"
                      : "Pending"
                }
            trailing="none"
              />
            ))}
          </V2SettingsGroup>
        ) : null}

        {importPreview && importPreview.warnings.length > 0 ? (
          <V2SettingsFootnote>
            {locale === "ko" ? "경고: " : "Warnings: "}
            {importPreview.warnings.join("; ")}
          </V2SettingsFootnote>
        ) : null}

        {importPreview && !importPreview.applied ? (
          <V2SecondaryBtn
            full
            tone="danger"
            style={{ marginTop: "var(--v2-s-2)" }}
            onClick={() => {
              void runReplace();
            }}
            disabled={importBusy !== "idle"}
          >
            {importBusy === "applying"
              ? locale === "ko"
                ? "적용 중..."
                : "Applying..."
              : locale === "ko"
                ? "이 파일로 교체"
                : "Replace With This File"}
          </V2SecondaryBtn>
        ) : null}

        <V2SettingsFootnote>
          {locale === "ko"
            ? "교체는 현재 계정의 운동 기록, 세트, 플랜, 커스텀 템플릿을 삭제 후 재삽입합니다. 공용 운동 카탈로그와 사용자 설정은 변경되지 않습니다."
            : "Replace deletes and re-inserts your logs, sets, plans, and custom templates. The shared exercise catalog and user settings are not affected."}
        </V2SettingsFootnote>
      </section>
    </div>
  );
}
