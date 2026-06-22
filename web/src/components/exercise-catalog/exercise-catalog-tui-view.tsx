"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocale } from "@/components/locale-provider";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { useQuerySettled } from "@/lib/ui/use-query-settled";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import {
  TermBadge,
  useRegisterTermFooter,
  type TermFooterRegistration,
} from "@/components/v2/terminal";
import { AppSelect, AppTextInput } from "@/components/ui/form-controls";

// terminal(ironlog) 운동 종목 관리 — paper ExerciseCatalogContent의 terminal 대응.
// paper 컴포넌트는 완전 무수정. 이 뷰가 동일한 데이터 로직(apiGet/Post/Patch/Delete +
// 낙관적 업데이트 + 디바운스 검색)을 자체 보유한다(분기 방식 a, 화면 래퍼에서 한쪽만 mount).
// 검색 + 카테고리 필터(client) + 리스트(`name [cat] · 별칭` + [edit]/[del] keyhint) +
// 인라인 생성/수정 폼(V2 폼 primitive cascade) + 삭제 확인(useAppDialog). 가상스크롤은
// 데이터 상한이 200개로 작고 TUI 행이 가볍기에 단순 리스트로(셸 ViewPane이 스크롤 소유).
// TermShell ViewPane 안에서 렌더되므로 외곽 패딩 없음.

type ExerciseItem = {
  id: string;
  name: string;
  category: string | null;
  aliases: string[];
};

type ExerciseResponse = { items: ExerciseItem[] };

type ExerciseCreateResponse = {
  exercise: { id: string; name: string; category: string | null } | null;
  created: boolean;
};

type EditingState = { id: string; name: string; category: string };

const ALL_CATEGORIES = "__all__";

export function ExerciseCatalogTuiView() {
  const { locale } = useLocale();
  const { confirm } = useAppDialog();
  const ko = locale === "ko";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<ExerciseItem[]>([]);
  const loadRequestIdRef = useRef(0);
  const catalogLoadedRef = useRef(false);

  const [query, setQuery] = useState("");
  const [activeLoadQuery, setActiveLoadQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [categories, setCategories] = useState<string[]>([]);

  // 생성 폼
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCategory, setCreateCategory] = useState("");
  const [createAliases, setCreateAliases] = useState("");
  const [savingCreate, setSavingCreate] = useState(false);

  // 수정 / 삭제
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── 데이터 로딩 (paper ExerciseCatalogContent와 동일 계약) ──
  const loadExercises = useCallback(
    async (search = "", isSilent = false) => {
      const requestId = ++loadRequestIdRef.current;
      try {
        if (!catalogLoadedRef.current && !isSilent) setLoading(true);
        setError(null);
        const normalized = search.trim().toLowerCase();
        setActiveLoadQuery(normalized);
        const params = new URLSearchParams({ limit: "200" });
        if (normalized) params.set("query", normalized);
        const res = await apiGet<ExerciseResponse>(
          `/api/exercises?${params.toString()}`,
        );
        if (requestId !== loadRequestIdRef.current) return;
        catalogLoadedRef.current = true;
        setItems(res.items ?? []);
      } catch (e: any) {
        if (requestId !== loadRequestIdRef.current) return;
        setError(
          e?.message ??
            (ko
              ? "운동종목 목록을 불러오지 못했습니다."
              : "Could not load the exercise list."),
        );
      } finally {
        if (requestId !== loadRequestIdRef.current) return;
        setLoading(false);
      }
    },
    [ko],
  );

  useEffect(() => {
    const id = window.setTimeout(() => void loadExercises(query), 220);
    return () => window.clearTimeout(id);
  }, [loadExercises, query]);

  useEffect(() => {
    apiGet<{ categories: string[] }>("/api/exercises/categories")
      .then((res) => setCategories(res.categories ?? []))
      .catch(() => {});
  }, []);

  const visibleItems = useMemo(() => {
    if (categoryFilter === ALL_CATEGORIES) return items;
    return items.filter(
      (it) => (it.category ?? "").toLowerCase() === categoryFilter.toLowerCase(),
    );
  }, [items, categoryFilter]);

  const listQueryKey = `exercise-catalog-tui:${activeLoadQuery}`;
  const isListSettled = useQuerySettled(listQueryKey, loading);

  // ── 생성 ──
  const handleCreate = async () => {
    try {
      setSavingCreate(true);
      setNotice(null);
      const newName = createName.trim();
      const newCategory = createCategory.trim() || null;
      const newAliases = createAliases
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);

      const tempId = `temp-${Date.now()}`;
      setItems((prev) => [
        { id: tempId, name: newName, category: newCategory, aliases: newAliases },
        ...prev,
      ]);
      setCreateName("");
      setCreateCategory("");
      setCreateAliases("");
      setCreateOpen(false);

      const res = await apiPost<ExerciseCreateResponse>("/api/exercises", {
        name: newName,
        category: newCategory,
      });
      if (res.exercise?.id && newAliases.length > 0) {
        for (const alias of newAliases) {
          await apiPost("/api/exercises/alias", {
            exerciseId: res.exercise.id,
            alias,
          });
        }
      }
      setNotice(
        res.created
          ? ko
            ? "운동종목이 추가되었습니다."
            : "Exercise added."
          : ko
            ? "이미 존재하는 운동종목입니다."
            : "That exercise already exists.",
      );
      await loadExercises(query, true);
    } catch (e: any) {
      setError(
        e?.message ??
          (ko ? "운동종목 추가에 실패했습니다." : "Failed to add the exercise."),
      );
      void loadExercises(query, true);
    } finally {
      setSavingCreate(false);
    }
  };

  // ── 수정 ──
  const handleEdit = async () => {
    if (!editing) return;
    try {
      setSavingEdit(true);
      setNotice(null);
      const { id: targetId, name: rawName, category: rawCat } = editing;
      const newName = rawName.trim();
      const newCategory = rawCat.trim() || null;

      setItems((prev) =>
        prev.map((it) =>
          it.id === targetId
            ? { ...it, name: newName, category: newCategory }
            : it,
        ),
      );
      setEditing(null);

      await apiPatch(`/api/exercises/${encodeURIComponent(targetId)}`, {
        name: newName,
        category: newCategory,
      });
      setNotice(ko ? "운동종목이 수정되었습니다." : "Exercise updated.");
      await loadExercises(query, true);
    } catch (e: any) {
      setError(
        e?.message ??
          (ko ? "운동종목 수정에 실패했습니다." : "Failed to update the exercise."),
      );
      void loadExercises(query, true);
    } finally {
      setSavingEdit(false);
    }
  };

  // ── 삭제 ──
  const makeDeleteHandler = (item: ExerciseItem) => async () => {
    const okConfirm = await confirm({
      title: ko ? "운동종목 삭제" : "Delete Exercise",
      message: ko
        ? `'${item.name}' 종목을 삭제하시겠습니까?\n기록에 연결된 exerciseId는 자동 해제됩니다.`
        : `Delete '${item.name}'?\nLinked exerciseIds in logs will be cleared automatically.`,
      confirmText: ko ? "삭제" : "Delete",
      cancelText: ko ? "취소" : "Cancel",
      tone: "danger",
    });
    if (!okConfirm) return;
    try {
      setDeletingId(item.id);
      setNotice(null);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      await apiDelete(`/api/exercises/${encodeURIComponent(item.id)}`);
      setNotice(ko ? "운동종목이 삭제되었습니다." : "Exercise deleted.");
      await loadExercises(query, true);
    } catch (e: any) {
      setError(
        e?.message ??
          (ko ? "운동종목 삭제에 실패했습니다." : "Failed to delete the exercise."),
      );
      void loadExercises(query, true);
    } finally {
      setDeletingId(null);
    }
  };

  // ── 셸 푸터: mode + 카운트(statusRight) + [n]new keyHint ──
  const footer = useMemo<TermFooterRegistration>(
    () => ({
      id: "exercise-catalog",
      mode: createOpen || editing ? "-- EDIT --" : "-- NORMAL --",
      modeTone: createOpen || editing ? "logging" : "normal",
      statusRight: `${visibleItems.length}/${items.length} ${ko ? "종목" : "exercises"}`,
      keyHints: [
        {
          key: "n",
          label: ko ? "추가" : "new",
          onPress: () => {
            setEditing(null);
            setCreateOpen(true);
          },
        },
      ],
    }),
    [createOpen, editing, visibleItems.length, items.length, ko],
  );
  useRegisterTermFooter(footer);

  const categoryTabs = useMemo(
    () => [ALL_CATEGORIES, ...categories],
    [categories],
  );

  return (
    <section
      aria-label={ko ? "운동 종목 관리" : "Exercise management"}
      style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-3)" }}
    >
      {/* 헤더 */}
      <div
        className="v2-mono-label"
        style={{ display: "flex", alignItems: "baseline", gap: "var(--v2-s-2)" }}
      >
        <span style={{ color: "var(--term-amber)" }}>
          {ko ? "운동 종목" : "exercises"}
        </span>
        <span style={{ color: "var(--term-ghost)" }}>
          {ko ? "추가·수정·카테고리·별칭" : "manage · category · aliases"}
        </span>
        <span style={{ marginLeft: "auto", color: "var(--term-cyan)" }}>
          {items.length}
        </span>
      </div>

      {/* 검색 */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={ko ? "운동종목 검색…" : "search exercises…"}
        aria-label={ko ? "운동종목 검색" : "Search exercises"}
        className="v2-mono-label"
        style={{
          minHeight: "var(--v2-touch)",
          padding: "0 var(--v2-s-2)",
          background: "var(--term-inset)",
          border: "none",
          outline: "none",
          color: "var(--term-fg)",
          borderRadius: "var(--v2-r-2)",
        }}
      />

      {/* 카테고리 필터 탭 */}
      {categories.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--v2-s-1)" }}>
          {categoryTabs.map((cat) => {
            const active = cat === categoryFilter;
            const label =
              cat === ALL_CATEGORIES ? (ko ? "전체" : "all") : cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className="v2-mono-label"
                style={tabStyle(active)}
              >
                [{label}
                {active ? "*" : ""}]
              </button>
            );
          })}
        </div>
      ) : null}

      {/* 상태 줄 */}
      {error ? (
        <div
          className="v2-mono-label"
          style={{ display: "flex", gap: "var(--v2-s-2)" }}
        >
          <span style={{ color: "var(--term-red)" }}>✕ {error}</span>
          <button
            type="button"
            onClick={() => void loadExercises(query)}
            className="v2-mono-label"
            style={keyhintBtnStyle}
          >
            [retry]
          </button>
        </div>
      ) : null}
      {notice ? (
        <span className="v2-mono-label" style={{ color: "var(--term-green)" }}>
          ✓ {notice}
        </span>
      ) : null}

      {/* 생성 폼 (인라인) */}
      {createOpen ? (
        <TuiExerciseForm
          ko={ko}
          name={createName}
          onNameChange={setCreateName}
          category={createCategory}
          onCategoryChange={setCreateCategory}
          aliases={createAliases}
          onAliasesChange={setCreateAliases}
          categories={categories}
          saving={savingCreate}
          submitLabel={ko ? "저장" : "save"}
          onSubmit={handleCreate}
          onCancel={() => {
            setCreateOpen(false);
            setCreateName("");
            setCreateCategory("");
            setCreateAliases("");
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setCreateOpen(true);
          }}
          className="v2-mono-label"
          style={addBtnStyle}
        >
          [+ {ko ? "운동종목 추가" : "add exercise"}]
        </button>
      )}

      {/* 리스트 */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
        <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
          {ko ? "활성 카탈로그" : "active catalog"}
        </span>

        {!isListSettled && items.length === 0 ? (
          <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
            …
          </span>
        ) : isListSettled && !error && visibleItems.length === 0 ? (
          <span className="v2-mono-label" style={{ color: "var(--term-ghost)" }}>
            {items.length === 0
              ? ko
                ? "운동종목이 없습니다 — [+ 추가]로 시작"
                : "no exercises — start with [+ add]"
              : ko
                ? "이 카테고리에 결과 없음"
                : "no results in this category"}
          </span>
        ) : (
          visibleItems.map((item) => {
            const editingThis = editing?.id === item.id;
            if (editingThis && editing) {
              return (
                <TuiExerciseForm
                  key={item.id}
                  ko={ko}
                  name={editing.name}
                  onNameChange={(v) =>
                    setEditing((p) => (p ? { ...p, name: v } : p))
                  }
                  category={editing.category}
                  onCategoryChange={(v) =>
                    setEditing((p) => (p ? { ...p, category: v } : p))
                  }
                  categories={categories}
                  saving={savingEdit}
                  submitLabel={ko ? "수정 저장" : "save changes"}
                  onSubmit={handleEdit}
                  onCancel={() => setEditing(null)}
                />
              );
            }
            return (
              <ExerciseTuiRow
                key={item.id}
                item={item}
                ko={ko}
                disabled={deletingId === item.id}
                onEdit={() => {
                  setCreateOpen(false);
                  setEditing({
                    id: item.id,
                    name: item.name,
                    category: item.category ?? "",
                  });
                }}
                onDelete={makeDeleteHandler(item)}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

// ── 운동 행: `name [cat] · 별칭` + [edit] [del] keyhint ──
function ExerciseTuiRow({
  item,
  ko,
  disabled,
  onEdit,
  onDelete,
}: {
  item: ExerciseItem;
  ko: boolean;
  disabled?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="v2-mono-label"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--v2-s-2)",
        minHeight: "var(--v2-touch)",
        padding: "var(--v2-s-1) var(--v2-s-2)",
        background: "var(--term-panel)",
        boxShadow: "inset 0 0 0 1px var(--term-line-box)",
        borderRadius: "var(--v2-r-2)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <span
          style={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--term-fg)",
          }}
        >
          {item.name}
          {item.category ? (
            <span style={{ color: "var(--term-dim)" }}>
              {" "}
              <TermBadge tone="info">{item.category}</TermBadge>
            </span>
          ) : null}
        </span>
        {item.aliases.length > 0 ? (
          <span
            style={{
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "var(--term-ghost)",
            }}
          >
            {ko ? "별칭" : "aka"} · {item.aliases.join(", ")}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        aria-label={ko ? `${item.name} 수정` : `Edit ${item.name}`}
        className="v2-mono-label"
        style={keyhintBtnStyle}
      >
        [edit]
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        aria-label={ko ? `${item.name} 삭제` : `Delete ${item.name}`}
        className="v2-mono-label"
        style={{ ...keyhintBtnStyle, color: "var(--term-red)" }}
      >
        [del]
      </button>
    </div>
  );
}

// ── 인라인 폼(생성/수정 공용) — V2 폼 primitive cascade(terminal 색 자동) ──
function TuiExerciseForm({
  ko,
  name,
  onNameChange,
  category,
  onCategoryChange,
  aliases,
  onAliasesChange,
  categories,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  ko: boolean;
  name: string;
  onNameChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  aliases?: string;
  onAliasesChange?: (v: string) => void;
  categories: string[];
  saving: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const isInitiallyCustom = category !== "" && !categories.includes(category);
  const [customMode, setCustomMode] = useState(isInitiallyCustom);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--v2-s-2)",
        padding: "var(--v2-s-3)",
        background: "var(--term-panel)",
        boxShadow: "inset 0 0 0 1px var(--term-line-box)",
        borderRadius: "var(--v2-r-2)",
      }}
    >
      <FieldLabel>{ko ? "운동종목명" : "exercise name"}</FieldLabel>
      <AppTextInput
        variant="compact"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder={ko ? "예: Incline Bench Press" : "e.g. Incline Bench Press"}
        autoFocus
      />

      <FieldLabel>{ko ? "카테고리" : "category"}</FieldLabel>
      <AppSelect
        variant="compact"
        value={customMode ? "__custom__" : category}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom__") {
            setCustomMode(true);
            onCategoryChange("");
          } else {
            setCustomMode(false);
            onCategoryChange(v);
          }
        }}
      >
        <option value="">{ko ? "미지정" : "Unassigned"}</option>
        {categories.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
        <option value="__custom__">{ko ? "직접 입력..." : "Custom..."}</option>
      </AppSelect>
      {customMode ? (
        <AppTextInput
          variant="compact"
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          placeholder={ko ? "카테고리 직접 입력" : "Enter a custom category"}
        />
      ) : null}

      {aliases !== undefined && onAliasesChange ? (
        <>
          <FieldLabel>
            {ko ? "별칭 (쉼표 구분)" : "aliases (comma-separated)"}
          </FieldLabel>
          <AppTextInput
            variant="compact"
            value={aliases}
            onChange={(e) => onAliasesChange(e.target.value)}
            placeholder={ko ? "예: 인클라인, Incline" : "e.g. incline, upper chest"}
          />
        </>
      ) : null}

      <div style={{ display: "flex", gap: "var(--v2-s-2)" }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="v2-mono-label"
          style={{ ...keyhintBtnStyle, flex: 1, textAlign: "center" }}
        >
          [{ko ? "취소" : "cancel"}]
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving || !name.trim()}
          className="v2-mono-label"
          style={{
            ...addBtnStyle,
            flex: 2,
            textAlign: "center",
            opacity: saving || !name.trim() ? 0.5 : 1,
          }}
        >
          [{saving ? (ko ? `${submitLabel}…` : `${submitLabel}…`) : submitLabel}]
        </button>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
      {children}
    </span>
  );
}

const keyhintBtnStyle: CSSProperties = {
  minHeight: "var(--v2-touch)",
  padding: "0 var(--v2-s-2)",
  background: "transparent",
  border: "none",
  color: "var(--term-cyan)",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const addBtnStyle: CSSProperties = {
  width: "100%",
  minHeight: "var(--v2-touch)",
  padding: "var(--v2-s-2) var(--v2-s-3)",
  background: "transparent",
  border: "none",
  boxShadow: "inset 0 0 0 1px var(--term-line-box)",
  borderRadius: "var(--v2-r-2)",
  color: "var(--term-cyan)",
  cursor: "pointer",
  textAlign: "left",
};

function tabStyle(active: boolean): CSSProperties {
  return {
    minHeight: "var(--v2-touch)",
    padding: "0 var(--v2-s-2)",
    background: active ? "var(--term-sel)" : "transparent",
    border: "none",
    boxShadow: active ? "inset var(--v2-s-1) 0 0 var(--term-amber)" : undefined,
    color: active ? "var(--term-amber)" : "var(--term-dim)",
    cursor: "pointer",
  };
}
