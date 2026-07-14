type Waiter = {
  kind: "read" | "write";
  resolve: (release: () => void) => void;
};

type LockState = {
  readers: number;
  writer: boolean;
  queue: Waiter[];
};

const locks = new Map<string, LockState>();

function stateFor(key: string) {
  const existing = locks.get(key);
  if (existing) return existing;
  const created: LockState = { readers: 0, writer: false, queue: [] };
  locks.set(key, created);
  return created;
}

function drain(key: string, state: LockState) {
  if (state.writer || state.readers > 0) return;
  const first = state.queue[0];
  if (!first) {
    locks.delete(key);
    return;
  }
  if (first.kind === "write") {
    state.queue.shift();
    state.writer = true;
    first.resolve(() => {
      state.writer = false;
      drain(key, state);
    });
    return;
  }
  while (state.queue[0]?.kind === "read") {
    const reader = state.queue.shift()!;
    state.readers += 1;
    reader.resolve(() => {
      state.readers -= 1;
      drain(key, state);
    });
  }
}

/**
 * Process-local request barrier for the single Lightsail apps/api process.
 * Normal authenticated requests share the lock; account deletion is exclusive.
 * Queued writers have priority so new traffic cannot starve deletion.
 */
export function acquireAccountRequestLock(userId: string, exclusive: boolean) {
  const key = userId.trim();
  const state = stateFor(key);
  const kind: Waiter["kind"] = exclusive ? "write" : "read";
  const writerQueued = state.queue.some((waiter) => waiter.kind === "write");
  if (kind === "read" && !state.writer && !writerQueued) {
    state.readers += 1;
    return Promise.resolve(() => {
      state.readers -= 1;
      drain(key, state);
    });
  }
  if (kind === "write" && !state.writer && state.readers === 0) {
    state.writer = true;
    return Promise.resolve(() => {
      state.writer = false;
      drain(key, state);
    });
  }
  return new Promise<() => void>((resolve) => {
    state.queue.push({ kind, resolve });
  });
}
