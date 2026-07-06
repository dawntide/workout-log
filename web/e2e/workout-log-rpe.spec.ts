/**
 * Workout log RPE save E2E (PR #253 follow-up).
 *
 * Validates that RPE values entered per set are persisted on save and
 * round-tripped on read. 프록시 cutover 이후 /api/logs는 apps/api로 포워딩되고
 * apps/api엔 WORKOUT_AUTH_USER_ID fallback이 없으므로(보안 의도), 각 테스트가
 * 실계정을 signup해 wl_session 쿠키로 인증한다(data-export-import 패턴).
 */
import { expect, test } from "@playwright/test";

type SaveResponse = {
  log: { id: string };
};

type LogRow = {
  id: string;
  sets: Array<{
    exerciseName: string;
    sortOrder: number;
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    rpe: number | null;
  }>;
};


// 테스트별 격리 계정 — request 픽스처가 signup 응답의 wl_session 쿠키를 이후
// 요청에 자동으로 실어 보낸다(웹 프록시가 쿠키→Bearer 변환).
async function signupFreshAccount(request: import("@playwright/test").APIRequestContext) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const res = await request.post("/api/auth/signup", {
    data: { email: `rpe-${suffix}@example.com`, password: "rpe-test-pw-123" },
  });
  if (!res.ok()) throw new Error(`signup failed: ${res.status()}`);
}

test.describe("workout log RPE persistence", () => {
  test("POST /api/logs persists rpe values per set", async ({ request }) => {
    await signupFreshAccount(request);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const performedAt = new Date().toISOString();

    const post = await request.post("/api/logs", {
      data: {
        performedAt,
        timezone: "UTC",
        notes: `rpe-test-${suffix}`,
        sets: [
          {
            exerciseName: "Squat",
            sortOrder: 0,
            setNumber: 1,
            reps: 5,
            weightKg: 100,
            rpe: 7,
          },
          {
            exerciseName: "Squat",
            sortOrder: 1,
            setNumber: 2,
            reps: 5,
            weightKg: 105,
            rpe: 8,
          },
          {
            exerciseName: "Squat",
            sortOrder: 2,
            setNumber: 3,
            reps: 3,
            weightKg: 110,
            rpe: 9,
          },
        ],
      },
    });
    expect(post.status()).toBe(201);
    const body = (await post.json()) as SaveResponse;
    expect(body.log?.id).toBeTruthy();

    const get = await request.get(`/api/logs/${body.log.id}`);
    expect(get.status()).toBeLessThan(400);
    const wrapper = (await get.json()) as { item: LogRow };
    const detail = wrapper.item;
    expect(Array.isArray(detail.sets)).toBe(true);
    expect(detail.sets.length).toBe(3);

    const sorted = [...detail.sets].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(sorted[0].rpe).toBe(7);
    expect(sorted[1].rpe).toBe(8);
    expect(sorted[2].rpe).toBe(9);
    expect(sorted[0].weightKg).toBe(100);
    expect(sorted[2].weightKg).toBe(110);
  });

  test("rpe omitted on set is stored as null", async ({ request }) => {
    await signupFreshAccount(request);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const post = await request.post("/api/logs", {
      data: {
        performedAt: new Date().toISOString(),
        timezone: "UTC",
        notes: `rpe-null-${suffix}`,
        sets: [
          {
            exerciseName: "Bench Press",
            sortOrder: 0,
            setNumber: 1,
            reps: 5,
            weightKg: 60,
            // rpe intentionally omitted
          },
        ],
      },
    });
    expect(post.status()).toBe(201);
    const { log } = (await post.json()) as SaveResponse;

    const get = await request.get(`/api/logs/${log.id}`);
    const wrapper = (await get.json()) as { item: LogRow };
    expect(wrapper.item.sets[0]?.rpe).toBeNull();
  });

  test("empty sets array is rejected", async ({ request }) => {
    await signupFreshAccount(request);
    const res = await request.post("/api/logs", {
      data: {
        performedAt: new Date().toISOString(),
        timezone: "UTC",
        sets: [],
      },
    });
    expect(res.status()).toBe(400);
  });

  test("PATCH log updates per-set rpe values", async ({ request }) => {
    await signupFreshAccount(request);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const created = await request.post("/api/logs", {
      data: {
        performedAt: new Date().toISOString(),
        timezone: "UTC",
        notes: `rpe-update-${suffix}`,
        sets: [
          { exerciseName: "Deadlift", sortOrder: 0, setNumber: 1, reps: 5, weightKg: 140, rpe: 7 },
          { exerciseName: "Deadlift", sortOrder: 1, setNumber: 2, reps: 5, weightKg: 140, rpe: 8 },
        ],
      },
    });
    expect(created.status()).toBe(201);
    const { log } = (await created.json()) as SaveResponse;

    const patch = await request.patch(`/api/logs/${log.id}`, {
      data: {
        timezone: "UTC",
        sets: [
          { exerciseName: "Deadlift", sortOrder: 0, setNumber: 1, reps: 5, weightKg: 140, rpe: 9 },
          { exerciseName: "Deadlift", sortOrder: 1, setNumber: 2, reps: 5, weightKg: 145, rpe: 10 },
        ],
      },
    });
    expect(patch.status()).toBeLessThan(400);

    const get = await request.get(`/api/logs/${log.id}`);
    const wrapper = (await get.json()) as { item: LogRow };
    const sorted = [...wrapper.item.sets].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(sorted[0].rpe).toBe(9);
    expect(sorted[1].rpe).toBe(10);
    expect(sorted[1].weightKg).toBe(145);
  });
});
