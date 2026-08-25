"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  V2NavRow,
  V2PrimaryBtn,
  V2SecondaryBtn,
  V2Segmented,
  V2TextField,
} from "@/components/v2/primitives";
import {
  V2SettingsFootnote,
  V2SettingsGroup,
  V2SettingsSection,
} from "@/components/v2/settings/section";
import { useLocale } from "@/components/locale-provider";

const BottomSheet = dynamic(
  () => import("@/components/ui/bottom-sheet").then((mod) => mod.BottomSheet),
  { ssr: false },
);

type ApiTokenScope = "read" | "read_write";

type ApiTokenItem = {
  tokenHash: string;
  tokenPrefix: string;
  name: string;
  scope: ApiTokenScope;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
};

function formatDateTime(iso: string | null, locale: "ko" | "en") {
  if (!iso) return locale === "ko" ? "없음" : "None";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * 개인 액세스 토큰(PAT).
 *
 * 활성 세션 바로 아래 자리한다 — 둘 다 "이 계정에 접근 중인 것" 목록이지만
 * **성격이 다르다**: 세션은 로그인이 만들고 만료로 사라지며 "다른 세션 모두 종료"의
 * 대상이다. PAT는 사용자가 명시 발급하고 명시 폐기하며, 세션 무효화에 휩쓸리지 않는다.
 * 그 차이가 화면에서도 보여야 해서 별도 섹션으로 둔다.
 */
export function ApiTokensSection() {
  const { locale } = useLocale();
  const ko = locale === "ko";

  const [tokens, setTokens] = useState<ApiTokenItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiTokenScope>("read");
  const [issuing, setIssuing] = useState(false);
  /** 발급 직후 **한 번만** 보여주는 평문. 서버는 해시만 갖고 있어 다시 못 만든다. */
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/api-tokens", { credentials: "include" });
      if (!response.ok) throw new Error(String(response.status));
      const payload = (await response.json()) as { items?: ApiTokenItem[] };
      setTokens(payload.items ?? []);
      setError(null);
    } catch {
      setError(ko ? "토큰 목록을 불러오지 못했습니다." : "Failed to load tokens.");
    }
  }, [ko]);

  useEffect(() => {
    void load();
  }, [load]);

  const openSheet = useCallback(() => {
    setName("");
    setScope("read");
    setIssuedToken(null);
    setError(null);
    setSheetOpen(true);
  }, []);

  const issue = useCallback(async () => {
    setIssuing(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/api-tokens", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scope }),
      });
      const payload = (await response.json()) as { token?: string; error?: string };
      if (!response.ok || !payload.token) {
        throw new Error(payload.error ?? String(response.status));
      }
      setIssuedToken(payload.token);
      await load();
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : ko
            ? "토큰 발급에 실패했습니다."
            : "Failed to issue the token.",
      );
    } finally {
      setIssuing(false);
    }
  }, [ko, load, name, scope]);

  const revoke = useCallback(
    async (tokenHash: string) => {
      setRevoking(tokenHash);
      setError(null);
      try {
        const response = await fetch(
          `/api/auth/api-tokens/${encodeURIComponent(tokenHash)}`,
          { method: "DELETE", credentials: "include" },
        );
        if (!response.ok) throw new Error(String(response.status));
        await load();
      } catch {
        setError(ko ? "토큰 폐기에 실패했습니다." : "Failed to revoke the token.");
      } finally {
        setRevoking(null);
      }
    },
    [ko, load],
  );

  const scopeLabel = (value: ApiTokenScope) =>
    value === "read_write" ? (ko ? "읽기+쓰기" : "Read + write") : ko ? "읽기" : "Read";

  return (
    <section>
      <V2SettingsSection
        title={ko ? "액세스 토큰" : "Access Tokens"}
        description={
          ko
            ? "스크립트나 MCP에서 내 데이터를 읽고 쓸 때 쓰는 토큰입니다. 세션과 달리 '다른 세션 종료'에 지워지지 않고, 여기서 폐기할 때까지 유효합니다."
            : "Tokens for scripts or MCP to read and write your data. Unlike sessions, they survive 'revoke other sessions' and stay valid until you revoke them here."
        }
      />

      {tokens && tokens.length > 0 ? (
        <V2SettingsGroup ariaLabel={ko ? "액세스 토큰 목록" : "Access token list"}>
          {tokens.map((token) => (
            <V2NavRow
              key={token.tokenHash}
              // **as="div"가 필수다.** 기본값은 button이라 안에 폐기 버튼을 넣으면
              // 버튼 중첩이 되고, 브라우저가 내부 버튼을 들어내 클릭이 안 먹는다.
              // 행 자체는 누를 데가 없으니(상세 화면 없음) div가 의미상으로도 맞다.
              as="div"
              label={`${token.name} · ${token.tokenPrefix}…`}
              description={
                ko
                  ? `${scopeLabel(token.scope)} · 발급 ${formatDateTime(token.createdAt, locale)} · 마지막 사용 ${formatDateTime(token.lastUsedAt, locale)}`
                  : `${scopeLabel(token.scope)} · Issued ${formatDateTime(token.createdAt, locale)} · Last used ${formatDateTime(token.lastUsedAt, locale)}`
              }
              trailing={
                <button
                  type="button"
                  onClick={() => void revoke(token.tokenHash)}
                  disabled={revoking === token.tokenHash}
                  aria-label={
                    ko ? `${token.name} 토큰 폐기` : `Revoke token ${token.name}`
                  }
                  className="v2-pressable v2-font-display"
                  style={{
                    minWidth: "44px",
                    minHeight: "44px",
                    padding: "0 var(--v2-s-2)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--v2-c-danger)",
                    fontSize: "var(--v2-t-12)",
                    fontWeight: 700,
                  }}
                >
                  {revoking === token.tokenHash
                    ? ko
                      ? "폐기 중…"
                      : "Revoking…"
                    : ko
                      ? "폐기"
                      : "Revoke"}
                </button>
              }
            />
          ))}
        </V2SettingsGroup>
      ) : tokens ? (
        <V2SettingsFootnote>
          {ko ? "발급한 토큰이 없습니다." : "No tokens issued yet."}
        </V2SettingsFootnote>
      ) : (
        <V2SettingsFootnote>{ko ? "불러오는 중..." : "Loading..."}</V2SettingsFootnote>
      )}

      {error ? (
        <p className="v2-small" style={{ color: "var(--v2-c-danger)" }}>
          {error}
        </p>
      ) : null}

      <V2SecondaryBtn full style={{ marginTop: "var(--v2-s-2)" }} onClick={openSheet}>
        {ko ? "새 토큰 발급" : "Issue New Token"}
      </V2SecondaryBtn>

      <V2SettingsFootnote>
        {ko
          ? "발급한 토큰은 그 화면에서 한 번만 보입니다 — 서버는 해시만 저장합니다. 잃어버리면 폐기하고 다시 발급하세요."
          : "A new token is shown once — the server only stores its hash. If you lose it, revoke and issue a new one."}
      </V2SettingsFootnote>

      {sheetOpen ? (
        <BottomSheet
          open={sheetOpen}
          title={ko ? "액세스 토큰 발급" : "Issue Access Token"}
          description={
            ko
              ? "용도를 적고 권한을 고르세요. 쓰기는 세션 기록에만 쓰입니다."
              : "Name it and choose a scope. Write access covers logging sessions only."
          }
          onClose={() => setSheetOpen(false)}
          closeLabel={ko ? "닫기" : "Close"}
          footer={null}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-4)" }}>
            {issuedToken ? (
              <>
                <p className="v2-small" style={{ margin: 0, color: "var(--v2-c-danger)" }}>
                  {ko
                    ? "지금 복사하세요. 이 화면을 닫으면 다시 볼 수 없습니다."
                    : "Copy it now — you cannot see it again after closing."}
                </p>
                <code
                  data-testid="issued-api-token"
                  style={{
                    display: "block",
                    padding: "var(--v2-s-3)",
                    background: "var(--v2-paper-2)",
                    borderRadius: "var(--v2-r-2)",
                    fontSize: "var(--v2-t-12)",
                    wordBreak: "break-all",
                    color: "var(--v2-ink)",
                  }}
                >
                  {issuedToken}
                </code>
                <V2PrimaryBtn full onClick={() => setSheetOpen(false)}>
                  {ko ? "복사했습니다" : "I've copied it"}
                </V2PrimaryBtn>
              </>
            ) : (
              <>
                <V2TextField
                  label={ko ? "이름" : "Name"}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={ko ? "예: MCP" : "e.g. MCP"}
                  maxLength={60}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
                  <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
                    {ko ? "권한" : "Scope"}
                  </span>
                  <V2Segmented
                    size="sm"
                    ariaLabel={ko ? "토큰 권한" : "Token scope"}
                    value={scope}
                    onChange={(next) => setScope(next as ApiTokenScope)}
                    options={[
                      { value: "read", label: ko ? "읽기" : "Read" },
                      { value: "read_write", label: ko ? "읽기+쓰기" : "Read + write" },
                    ]}
                  />
                  <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
                    {ko
                      ? "기본은 읽기입니다. 어느 쪽이든 설정 변경·계정 관리·데이터 삭제에는 쓸 수 없습니다."
                      : "Read is the default. Neither scope can change settings, manage the account, or delete data."}
                  </p>
                </div>
                <V2PrimaryBtn
                  full
                  onClick={() => void issue()}
                  disabled={issuing || !name.trim()}
                >
                  {issuing ? (ko ? "발급 중…" : "Issuing…") : ko ? "발급" : "Issue"}
                </V2PrimaryBtn>
              </>
            )}
          </div>
        </BottomSheet>
      ) : null}
    </section>
  );
}
