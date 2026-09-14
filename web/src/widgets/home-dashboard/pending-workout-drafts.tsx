"use client";

import { useEffect, useState } from "react";
import { V2Card, V2NavRow, V2Inline, V2Stack, V2SecondaryBtn } from "@/components/v2/primitives";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useLocale } from "@/components/locale-provider";
import { clearWorkoutDraft, listWorkoutDrafts, type WorkoutDraftData } from "@/lib/storage/workoutDraftStore";
import { hasWorkoutEdits } from "@/lib/workout-record/model";
import { hasProgramEntryStateEdits } from "@/lib/workout-record/entry-state";
import { apiGet } from "@/lib/api";
import { isDraftAlreadySaved, recoveryHref, recoveryLookupPath, type RecoverySavedLog } from "@/lib/workout-record/recovery";

const DISMISSED_NOTICE_KEY = "workoutlog:dismissed-draft-notice";

function noticeSignature(drafts: WorkoutDraftData[]) {
  return JSON.stringify(drafts.map(({ key, updatedAt }) => [key, updatedAt]).sort());
}

export function PendingWorkoutDrafts() {
  const { locale } = useLocale();
  const [drafts, setDrafts] = useState<WorkoutDraftData[]>([]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const ko = locale === "ko";
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    try { setDismissed(localStorage.getItem(DISMISSED_NOTICE_KEY)); } catch { /* Memory-only dismissal. */ }
    void listWorkoutDrafts().then(async (items) => {
      const candidates = items.filter(({ draft, programEntryState }) => {
        try {
          return hasWorkoutEdits(draft) || hasProgramEntryStateEdits(programEntryState ?? {});
        } catch {
          // A malformed local entry must not prevent the home page from opening.
          return false;
        }
      });
      // Only local candidates trigger a lookup. Network failure must never discard a draft.
      const timeout = window.setTimeout(() => controller.abort(), 4000);
      try {
        const pending = [...candidates];
        const savedKeys = new Set<string>();
        await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
          while (pending.length && !controller.signal.aborted) {
            const item = pending.shift()!;
            const path = recoveryLookupPath(item);
            if (!path) continue;
            try {
              const response = await apiGet<{ items: RecoverySavedLog[] }>(path, {
                cachePolicy: "network-only", signal: controller.signal,
              });
              if (response.items.some((log) => isDraftAlreadySaved(item, log))) savedKeys.add(item.key);
            } catch { /* Keep unverified work available, including while offline. */ }
          }
        }));
        if (active) setDrafts(candidates.filter((item) => !savedKeys.has(item.key)));
      } finally { window.clearTimeout(timeout); }
    });
    return () => { active = false; controller.abort(); };
  }, []);
  if (drafts.length === 0) return null;
  const signature = noticeSignature(drafts);
  const dismiss = () => {
    setDismissed(signature);
    setOpen(false);
    setDeleteKey(null);
    try { localStorage.setItem(DISMISSED_NOTICE_KEY, signature); } catch { /* Memory-only dismissal. */ }
  };
  const remove = async (key: string) => {
    await clearWorkoutDraft(key);
    setDrafts((items) => items.filter((item) => item.key !== key));
    setDeleteKey(null);
  };
  return (
    <>
      {dismissed === signature ? (
        <V2SecondaryBtn icon="history" onClick={() => setOpen(true)}>
          {ko ? `복구 목록 (${drafts.length})` : `Recovery list (${drafts.length})`}
        </V2SecondaryBtn>
      ) : (
        <V2Card padding="var(--v2-s-4)">
          <V2Stack gap={2}>
            <h2 className="v2-h3">{ko ? "기기에 남은 운동 기록이 있어요" : "Workout drafts on this device"}</h2>
            <p className="v2-small">{ko ? `${drafts.length}개의 초안을 확인하거나 나중에 복구할 수 있어요.` : `${drafts.length} drafts are available to review or recover later.`}</p>
            <V2Inline gap={2} wrap>
              <V2SecondaryBtn onClick={() => setOpen(true)}>{ko ? "목록 보기" : "View list"}</V2SecondaryBtn>
              <V2SecondaryBtn onClick={dismiss}>{ko ? "나중에" : "Later"}</V2SecondaryBtn>
            </V2Inline>
          </V2Stack>
        </V2Card>
      )}
      <BottomSheet open={open} onClose={dismiss} title={ko ? "복구 목록" : "Recovery list"}
        closeLabel={ko ? "닫기" : "Close"}
        footer={<V2SecondaryBtn full onClick={dismiss}>{ko ? "나중에" : "Later"}</V2SecondaryBtn>}>
        <V2Stack gap={3}>
          <p className="v2-small">{ko ? "이 기기에 남은 초안입니다. 필요 없는 초안은 삭제할 수 있어요. 저장된 운동 기록은 삭제되지 않습니다." : "Drafts stored on this device. Deleting a draft keeps your saved workouts."}</p>
          {drafts.map((item) => (
            <V2Card key={item.key} tone="inset" padding="var(--v2-s-3)">
              <V2NavRow label={item.draft.session.planName || (ko ? "자유 운동" : "Workout")}
                description={item.draft.session.sessionDate} as="a" href={recoveryHref(item)} />
              {deleteKey === item.key ? (
                <V2Stack gap={2}>
                  <p className="v2-small">{ko ? "이 초안을 삭제할까요? 삭제 후에는 복구할 수 없어요." : "Delete this draft? This cannot be undone."}</p>
                  <V2Inline gap={2} wrap>
                    <V2SecondaryBtn tone="danger" onClick={() => void remove(item.key)}>{ko ? "초안 삭제" : "Delete draft"}</V2SecondaryBtn>
                    <V2SecondaryBtn onClick={() => setDeleteKey(null)}>{ko ? "취소" : "Cancel"}</V2SecondaryBtn>
                  </V2Inline>
                </V2Stack>
              ) : <V2SecondaryBtn onClick={() => setDeleteKey(item.key)}>{ko ? "삭제" : "Delete"}</V2SecondaryBtn>}
            </V2Card>
          ))}
        </V2Stack>
      </BottomSheet>
    </>
  );
}
