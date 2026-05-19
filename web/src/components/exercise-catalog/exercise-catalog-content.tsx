"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useLocale } from "@/components/locale-provider";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { useQuerySettled } from "@/lib/ui/use-query-settled";
import { EmptyStateRows, ErrorStateRows, LoadingStateRows, NoticeStateRows } from "@/components/ui/settings-state";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import {
  V2Card,
  V2IconBtn,
  V2PrimaryBtn,
  V2SecondaryBtn,
} from "@/components/v2/primitives";
import { AppSelect, AppTextInput } from "@/components/ui/form-controls";
import { SearchInput } from "@/components/ui/search-input";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Swipeable delete row ─────────────────────────────────────────────────────

const SwipeableExerciseRow = memo(function SwipeableExerciseRow({
  children,
  onDelete,
  deleteLabel,
  disabled,
}: {
  children: ReactNode;
  onDelete: () => void;
  deleteLabel: string;
  disabled?: boolean;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number | null>(null);

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (disabled) return;
    startXRef.current = e.touches[0].clientX;
    setIsDragging(true);
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (disabled || !isDragging || startXRef.current === null) return;
    const diff = e.touches[0].clientX - startXRef.current;
    if (diff < 0) {
      setOffsetX(Math.max(diff, -72));
    } else if (offsetX < 0) {
      setOffsetX(Math.min(0, offsetX + diff));
      startXRef.current = e.touches[0].clientX;
    } else {
      setOffsetX(0);
    }
  };

  const handleTouchEnd = () => {
    if (disabled) return;
    setIsDragging(false);
    setOffsetX(offsetX < -36 ? -72 : 0);
  };

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--v2-r-2)" }}>
      {/* Swipe-revealed delete button */}
      <div
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: 72,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <V2IconBtn
          icon="delete"
          label={deleteLabel}
          tone="neutral"
          onClick={() => {
            setOffsetX(0);
            onDelete();
          }}
        />
      </div>

      {/* Draggable content */}
      <div
        data-no-swipe="true"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
          position: "relative", zIndex: 1, touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
});

// ─── Category badge ───────────────────────────────────────────────────────────

const CATEGORY_LABEL_CLASS: Record<string, string> = {
  chest:      "label-primary",
  back:       "label-warning",
  legs:       "label-muscle",
  quads:      "label-muscle",
  hamstrings: "label-muscle",
  glutes:     "label-muscle",
  shoulders:  "label-accent",
  arms:       "label-info",
  biceps:     "label-info",
  triceps:    "label-info",
  core:       "label-set-type",
  cardio:     "label-complete",
};

const CategoryBadge = memo(function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const cls = CATEGORY_LABEL_CLASS[category.toLowerCase()] ?? "label-neutral";
  return (
    <span className={`label label-sm ${cls}`}>
      {category}
    </span>
  );
});

// ─── Category field (select + custom) ────────────────────────────────────────

const CategoryField = memo(function CategoryField({
  label,
  value,
  onChange,
  categories,
  locale,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  categories: string[];
  locale: "ko" | "en";
}) {
  const isInitiallyCustom = value !== "" && !categories.includes(value);
  const [customMode, setCustomMode] = useState(isInitiallyCustom);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
      <FieldLabel>{label}</FieldLabel>
      <AppSelect
        variant="compact"
        value={customMode ? "__custom__" : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom__") { setCustomMode(true); onChange(""); }
          else { setCustomMode(false); onChange(v); }
        }}
      >
        <option value="">{locale === "ko" ? "미지정" : "Unassigned"}</option>
        {categories.map((cat) => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
        <option value="__custom__">{locale === "ko" ? "직접 입력..." : "Custom..."}</option>
      </AppSelect>
      {customMode && (
        <AppTextInput
          variant="compact"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={locale === "ko" ? "카테고리 직접 입력" : "Enter a custom category"}
        />
      )}
    </div>
  );
});

// ─── Shared field label ───────────────────────────────────────────────────────

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="v2-eyebrow" style={{ color: "var(--v2-ink-2)" }}>
      {children}
    </span>
  );
}

// ─── Inline exercise form (create or edit) ────────────────────────────────────

function InlineExerciseForm({
  name,
  onNameChange,
  category,
  onCategoryChange,
  aliases,
  onAliasesChange,
  categories,
  onSubmit,
  onCancel,
  saving,
  submitLabel,
  locale,
}: {
  name: string;
  onNameChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  aliases?: string;
  onAliasesChange?: (v: string) => void;
  categories: string[];
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
  locale: "ko" | "en";
}) {
  return (
    <V2Card tone="paper" padding="var(--v2-s-4)">
      <>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-4)" }}>
          {/* Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
            <FieldLabel>{locale === "ko" ? "운동종목명" : "Exercise Name"}</FieldLabel>
            <AppTextInput
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={locale === "ko" ? "예: Incline Bench Press" : "e.g. Incline Bench Press"}
              autoFocus
            />
          </div>

          {/* Category + Aliases grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: aliases !== undefined ? "1fr 1fr" : "1fr",
            gap: "var(--v2-s-4)",
          }}>
            <CategoryField
              label={locale === "ko" ? "카테고리" : "Category"}
              value={category}
              onChange={onCategoryChange}
              categories={categories}
              locale={locale}
            />
            {aliases !== undefined && onAliasesChange && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
                <FieldLabel>{locale === "ko" ? "별칭 (쉼표 구분)" : "Aliases (comma-separated)"}</FieldLabel>
                <AppTextInput
                  variant="compact"
                  value={aliases}
                  onChange={(e) => onAliasesChange(e.target.value)}
                  placeholder={locale === "ko" ? "예: 인클라인, Incline" : "e.g. incline, upper chest"}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "var(--v2-s-2)" }}>
            <V2SecondaryBtn
              style={{ flex: 1 }}
              onClick={onCancel}
              disabled={saving}
            >
              {locale === "ko" ? "취소" : "Cancel"}
            </V2SecondaryBtn>
            <V2PrimaryBtn
              style={{ flex: 2 }}
              onClick={onSubmit}
              disabled={saving || !name.trim()}
            >
              {saving ? (locale === "ko" ? `${submitLabel} 중...` : `${submitLabel}...`) : submitLabel}
            </V2PrimaryBtn>
          </div>
        </div>
      </>
    </V2Card>
  );
}

// ─── Exercise row (view mode) ─────────────────────────────────────────────────

function ExerciseRowView({
  item,
  onEdit,
  disabled,
  locale,
}: {
  item: ExerciseItem;
  onEdit: () => void;
  disabled?: boolean;
  locale: "ko" | "en";
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "var(--v2-s-4)",
      backgroundColor: "var(--v2-paper-2)",
      borderRadius: "var(--v2-r-2)",
      gap: "var(--v2-s-2)",
    }}>
      {/* Left content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--v2-s-2)", flexWrap: "wrap" as const }}>
          <span className="v2-body" style={{ color: "var(--v2-ink)", fontWeight: 700 }}>
            {item.name}
          </span>
          <CategoryBadge category={item.category} />
        </div>
        {item.aliases.length > 0 && (
          <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
            {locale === "ko" ? "별칭" : "Aliases"}: {item.aliases.join(", ")}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
        <V2IconBtn
          icon="edit"
          label={locale === "ko" ? `${item.name} 수정` : `Edit ${item.name}`}
          disabled={disabled}
          onClick={onEdit}
        />
      </div>
    </div>
  );
}

// ─── Stats bento grid ─────────────────────────────────────────────────────────

function StatsGrid({ total, items, locale }: { total: number; items: ExerciseItem[]; locale: "ko" | "en" }) {
  const avatars = useMemo(() =>
    items.slice(0, 3).map((it) => {
      const words = it.name.trim().split(/\s+/);
      return words.length >= 2
        ? (words[0][0] + words[1][0]).toUpperCase()
        : it.name.slice(0, 2).toUpperCase();
    }),
    [items]
  );

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "var(--v2-s-2)",
      marginBottom: "var(--v2-s-5)",
    }}>
      {/* Total count tile */}
      <div style={{
        backgroundColor: "var(--v2-paper-2)",
        borderRadius: "var(--v2-r-2)",
        padding: "var(--v2-s-4)",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        minHeight: "96px",
      }}>
        <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
          {locale === "ko" ? "전체 종목" : "Total Exercises"}
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: "var(--v2-s-1)" }}>
          <span className="v2-num-md" style={{ color: "var(--v2-accent)", lineHeight: 1 }}>
            {total}
          </span>
          <span className="v2-label" style={{ color: "var(--v2-ink-3)" }}>
            {locale === "ko" ? "종목" : "items"}
          </span>
        </div>
      </div>

      {/* Recent exercises tile */}
      <div style={{
        backgroundColor: "var(--v2-accent-weak)",
        borderRadius: "var(--v2-r-2)",
        padding: "var(--v2-s-4)",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        minHeight: "96px",
      }}>
        <span className="v2-eyebrow" style={{ color: "var(--v2-ink-2)" }}>
          {locale === "ko" ? "최근 종목" : "Recent Exercises"}
        </span>
        {avatars.length > 0 ? (
          <div style={{ display: "flex" }}>
            {avatars.map((initials, i) => (
              <div
                key={i}
                className="v2-eyebrow"
                style={{
                  width: "var(--v2-s-7)",
                  height: "var(--v2-s-7)",
                  borderRadius: "var(--v2-r-pill)",
                  backgroundColor: "var(--v2-paper-3)",
                  boxShadow: "0 0 0 2px var(--v2-paper)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--v2-ink)",
                  marginLeft: i > 0 ? "calc(var(--v2-s-2) * -1)" : 0,
                  position: "relative",
                  zIndex: avatars.length - i,
                }}
              >
                {initials}
              </div>
            ))}
          </div>
        ) : (
          <span className="v2-small" style={{ color: "var(--v2-ink-3)" }}>—</span>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ExerciseCatalogContent() {
  const { locale } = useLocale();
  const { confirm } = useAppDialog();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<ExerciseItem[]>([]);
  const loadRequestIdRef = useRef(0);
  const catalogLoadedRef = useRef(false);

  const [query, setQuery] = useState("");
  const [activeLoadQuery, setActiveLoadQuery] = useState("");

  // Create form state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCategory, setCreateCategory] = useState("");
  const [createAliases, setCreateAliases] = useState("");
  const [savingCreate, setSavingCreate] = useState(false);

  const [categories, setCategories] = useState<string[]>([]);

  // Edit state
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadExercises = useCallback(async (search = "", isSilent = false) => {
    const requestId = ++loadRequestIdRef.current;
    try {
      if (!catalogLoadedRef.current && !isSilent) setLoading(true);
      setError(null);
      const normalized = search.trim().toLowerCase();
      setActiveLoadQuery(normalized);
      const params = new URLSearchParams({ limit: "200" });
      if (normalized) params.set("query", normalized);
      const res = await apiGet<ExerciseResponse>(`/api/exercises?${params.toString()}`);
      if (requestId !== loadRequestIdRef.current) return;
      catalogLoadedRef.current = true;
      setItems(res.items ?? []);
    } catch (e: any) {
      if (requestId !== loadRequestIdRef.current) return;
      setError(e?.message ?? (locale === "ko" ? "운동종목 목록을 불러오지 못했습니다." : "Could not load the exercise list."));
    } finally {
      if (requestId !== loadRequestIdRef.current) return;
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadExercises(query), 220);
    return () => window.clearTimeout(id);
  }, [loadExercises, query]);

  useEffect(() => {
    apiGet<{ categories: string[] }>("/api/exercises/categories")
      .then((res) => setCategories(res.categories ?? []))
      .catch(() => {});
  }, []);

  const visibleItems = useMemo(() => items, [items]);
  const listQueryKey = `exercise-catalog:${activeLoadQuery}`;
  const isListSettled = useQuerySettled(listQueryKey, loading);

  // ── 가상 스크롤 설정 ─────────────────────────────────────────────────────────
  // PERF: 최대 200개 아이템을 전부 DOM에 마운트하는 대신 뷰포트 내 아이템만 렌더링
  const listContainerRef = useRef<HTMLDivElement>(null);
  const listOffsetRef = useRef(0);

  useLayoutEffect(() => {
    listOffsetRef.current = listContainerRef.current?.offsetTop ?? 0;
  });

  const virtualizer = useWindowVirtualizer({
    count: visibleItems.length,
    estimateSize: () => 84, // SwipeableExerciseRow 예상 높이 (px)
    overscan: 4,            // 뷰포트 밖 위아래 4개씩 미리 렌더링
    scrollMargin: listOffsetRef.current,
  });

  // ── Create ──────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    try {
      setSavingCreate(true);
      setNotice(null);
      const newName = createName.trim();
      const newCategory = createCategory.trim() || null;
      const newAliases = createAliases.split(",").map((a) => a.trim()).filter(Boolean);

      // Optimistic
      const tempId = `temp-${Date.now()}`;
      setItems((prev) => [{ id: tempId, name: newName, category: newCategory, aliases: newAliases }, ...prev]);
      setCreateName(""); setCreateCategory(""); setCreateAliases("");
      setCreateOpen(false);

      const res = await apiPost<ExerciseCreateResponse>("/api/exercises", { name: newName, category: newCategory });
      if (res.exercise?.id && newAliases.length > 0) {
        for (const alias of newAliases) {
          await apiPost("/api/exercises/alias", { exerciseId: res.exercise.id, alias });
        }
      }
      setNotice(res.created ? (locale === "ko" ? "운동종목이 추가되었습니다." : "Exercise added.") : (locale === "ko" ? "이미 존재하는 운동종목입니다." : "That exercise already exists."));
      await loadExercises(query, true);
    } catch (e: any) {
      setError(e?.message ?? (locale === "ko" ? "운동종목 추가에 실패했습니다." : "Failed to add the exercise."));
      void loadExercises(query, true);
    } finally {
      setSavingCreate(false);
    }
  };

  // ── Edit ────────────────────────────────────────────────────────────────────

  const handleEdit = async () => {
    if (!editing) return;
    try {
      setSavingEdit(true);
      setNotice(null);
      const { id: targetId, name: rawName, category: rawCat } = editing;
      const newName = rawName.trim();
      const newCategory = rawCat.trim() || null;

      // Optimistic
      setItems((prev) => prev.map((it) => it.id === targetId ? { ...it, name: newName, category: newCategory } : it));
      setEditing(null);

      await apiPatch(`/api/exercises/${encodeURIComponent(targetId)}`, { name: newName, category: newCategory });
      setNotice(locale === "ko" ? "운동종목이 수정되었습니다." : "Exercise updated.");
      await loadExercises(query, true);
    } catch (e: any) {
      setError(e?.message ?? (locale === "ko" ? "운동종목 수정에 실패했습니다." : "Failed to update the exercise."));
      void loadExercises(query, true);
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

  const makeDeleteHandler = (item: ExerciseItem) => async () => {
    const ok = await confirm({
      title: locale === "ko" ? "운동종목 삭제" : "Delete Exercise",
      message: locale === "ko" ? `'${item.name}' 종목을 삭제하시겠습니까?\n기록에 연결된 exerciseId는 자동 해제됩니다.` : `Delete '${item.name}'?\nLinked exerciseIds in logs will be cleared automatically.`,
      confirmText: locale === "ko" ? "삭제" : "Delete",
      cancelText: locale === "ko" ? "취소" : "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    try {
      setDeletingId(item.id);
      setNotice(null);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      await apiDelete(`/api/exercises/${encodeURIComponent(item.id)}`);
      setNotice(locale === "ko" ? "운동종목이 삭제되었습니다." : "Exercise deleted.");
      await loadExercises(query, true);
    } catch (e: any) {
      setError(e?.message ?? (locale === "ko" ? "운동종목 삭제에 실패했습니다." : "Failed to delete the exercise."));
      void loadExercises(query, true);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Editorial page header */}
      <div style={{
        marginBottom: "var(--v2-s-7)",
        paddingBottom: "var(--v2-s-4)",
      }}>
        <div className="v2-eyebrow" style={{ color: "var(--v2-accent)", marginBottom: "var(--v2-s-1)" }}>
          Exercise Library
        </div>
        <h1 className="v2-h1" style={{ color: "var(--v2-ink)", margin: "0 0 var(--v2-s-2)" }}>
          {locale === "ko" ? "운동 종목 관리" : "Exercise Management"}
        </h1>
        <p className="v2-small" style={{ color: "var(--v2-ink-2)", margin: 0, lineHeight: 1.5 }}>
          {locale === "ko" ? "종목을 추가·수정하거나 카테고리와 별칭을 관리합니다." : "Add and edit exercises, categories, and aliases."}
        </p>
      </div>

      {/* Status */}
      <LoadingStateRows active={loading} delayMs={120} label={locale === "ko" ? "운동종목 목록 로딩 중" : "Loading exercises"} description={locale === "ko" ? "DB 저장 종목을 조회하고 있습니다." : "Fetching saved exercises from the database."} />
      <ErrorStateRows message={error} title={locale === "ko" ? "운동종목 목록 조회 실패" : "Could not load exercises"} onRetry={() => void loadExercises(query)} />
      <NoticeStateRows message={notice} label={locale === "ko" ? "안내" : "Notice"} />

      {/* Search */}
      <div style={{ marginBottom: "var(--v2-s-4)" }}>
        <SearchInput
          bare
          value={query}
          onChange={setQuery}
          placeholder={locale === "ko" ? "운동종목 검색" : "Search exercises"}
          ariaLabel={locale === "ko" ? "운동종목 검색" : "Search exercises"}
        />
      </div>

      {/* Stats bento */}
      <StatsGrid total={visibleItems.length} items={visibleItems} locale={locale} />

      {/* Inline create form */}
      {createOpen && (
        <div style={{ marginBottom: "var(--v2-s-4)" }}>
          <InlineExerciseForm
            name={createName}
            onNameChange={setCreateName}
            category={createCategory}
            onCategoryChange={setCreateCategory}
            aliases={createAliases}
            onAliasesChange={setCreateAliases}
            categories={categories}
            onSubmit={handleCreate}
            onCancel={() => { setCreateOpen(false); setCreateName(""); setCreateCategory(""); setCreateAliases(""); }}
            saving={savingCreate}
            submitLabel={locale === "ko" ? "저장" : "Save"}
            locale={locale}
          />
        </div>
      )}

      {/* Add button (hidden while form is open) */}
      {!createOpen && (
        <V2SecondaryBtn
          full
          icon="add"
          style={{ marginBottom: "var(--v2-s-5)" }}
          onClick={() => setCreateOpen(true)}
        >
          {locale === "ko" ? "운동종목 추가" : "Add Exercise"}
        </V2SecondaryBtn>
      )}

      {/* Section header */}
      <h2 className="v2-eyebrow" style={{ color: "var(--v2-ink-2)", margin: "0 0 var(--v2-s-2)" }}>
        {locale === "ko" ? "활성 카탈로그" : "Active Catalog"}
      </h2>

      {/* Exercise list — useWindowVirtualizer로 뷰포트 내 아이템만 렌더링 */}
      <EmptyStateRows
        when={isListSettled && !error && visibleItems.length === 0}
        label={locale === "ko" ? "운동종목이 없습니다" : "No exercises"}
        description={locale === "ko" ? "상단 버튼으로 운동종목을 추가하세요." : "Add an exercise using the button above."}
      />

      <div
        ref={listContainerRef}
        style={{
          position: "relative",
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = visibleItems[virtualItem.index];
          const deletingThis = deletingId === item.id;
          const editingThis = editing?.id === item.id;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                paddingBottom: "var(--v2-s-2)",
                transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {editingThis && editing ? (
                <InlineExerciseForm
                  name={editing.name}
                  onNameChange={(v) => setEditing((p) => p ? { ...p, name: v } : p)}
                  category={editing.category}
                  onCategoryChange={(v) => setEditing((p) => p ? { ...p, category: v } : p)}
                  categories={categories}
                  onSubmit={handleEdit}
                  onCancel={() => setEditing(null)}
                  saving={savingEdit}
                  submitLabel={locale === "ko" ? "수정 저장" : "Save Changes"}
                  locale={locale}
                />
              ) : (
                <SwipeableExerciseRow
                  onDelete={makeDeleteHandler(item)}
                  deleteLabel={locale === "ko" ? "운동종목 삭제" : "Delete exercise"}
                  disabled={deletingThis}
                >
                  <ExerciseRowView
                    item={item}
                    locale={locale}
                    disabled={deletingThis}
                    onEdit={() => setEditing({ id: item.id, name: item.name, category: item.category ?? "" })}
                  />
                </SwipeableExerciseRow>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
