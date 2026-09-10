/**
 * 저장 실패를 사람과 텔레메트리 양쪽이 읽을 수 있게 만든다.
 *
 * 2026-09-08 프로덕션 실패를 조사할 때 남은 단서가 화면 문구 하나뿐이었다. 서버 액션은
 * 예외를 삼켜 `{success:false}`로 돌려주므로 Vercel 에러 그룹에 잡히지 않고, hobby 플랜은
 * 런타임 로그를 보존하지 않는다. 그래서 **던져진 값의 정체를 문구에 실어 두는 것**이
 * 사후 조사의 유일한 입구가 된다 — 폴백만 뜨면 서버 거부인지 전송 실패인지 가릴 수 없다.
 */

/** ux-events ingest는 배치 페이로드 16KB에서 413을 낸다. 한 이벤트가 배치를 죽이면 그 배치의 다른 실패 기록까지 함께 사라진다. */
const PROP_MESSAGE_LIMIT = 200;

export type SaveFailureDiagnosis = {
  /** 화면에 그대로 보여줄 문구. */
  message: string;
  /** `workout_save_failed` 이벤트에 실을 props(원시값만). */
  props: Record<string, string | number | boolean | null>;
};

/**
 * 값의 종류를 한 단어로. Error면 name(AbortError·TypeError…), 아니면 typeof.
 * 이 한 단어가 "서버가 거부했나, 요청이 못 갔나"를 가른다.
 */
function readErrorKind(error: unknown): string {
  if (error === null) return "null";
  if (error instanceof Error) return error.name || "Error";
  return typeof error;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message ?? "";
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/**
 * Next는 서버 액션이 리다이렉트로 끊기면 `digest`(목적지·상태코드)를 단 Error로 reject한다.
 * 세션 만료로 /login에 튕긴 경우가 여기서만 드러난다.
 */
function readErrorDigest(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest ? digest : null;
}

export function diagnoseSaveFailure(
  error: unknown,
  locale: "ko" | "en",
): SaveFailureDiagnosis {
  const kind = readErrorKind(error);
  const message = readErrorMessage(error);
  const digest = readErrorDigest(error);

  const fallback =
    locale === "ko"
      ? "운동기록 저장에 실패했습니다."
      : "Failed to save the workout log.";

  return {
    // 읽을 수 있는 문구가 있으면 그대로 — 서버 거부 문구를 폴백으로 덮으면 계층 단서가 사라진다.
    message: message || `${fallback} (${digest ?? kind})`,
    props: {
      errorName: kind,
      errorMessage: message.slice(0, PROP_MESSAGE_LIMIT),
      errorDigest: digest,
    },
  };
}

export type SaveAttemptOutcome =
  | { status: "saved" }
  | { status: "failed"; error: unknown }
  | { status: "saved-with-post-error"; error: unknown };

/**
 * 저장 호출만 실패 경계 안에 둔다.
 *
 * 저장 성공 뒤의 후처리(성공 토스트·세션 화면 이동)가 같은 try 안에 있으면, 후처리가 던졌을 때
 * **DB에는 기록이 들어갔는데 화면은 "저장 실패"**를 띄운다. 사용자는 이미 저장된 세션을 다시
 * 입력하게 되고, REF5는 같은 생성 세션에 두 번째 기록을 허용하지 않아 그 재입력마저 거부된다.
 */
export async function runSaveAttempt<T>({
  save,
  afterSave,
}: {
  save: () => Promise<T>;
  afterSave: (result: T) => void;
}): Promise<SaveAttemptOutcome> {
  let result: T;
  try {
    result = await save();
  } catch (error) {
    return { status: "failed", error };
  }

  try {
    afterSave(result);
  } catch (error) {
    return { status: "saved-with-post-error", error };
  }

  return { status: "saved" };
}
