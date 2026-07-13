import assert from "node:assert/strict";
import test from "node:test";

import { runSingleFlight } from "./single-flight";

test("coalesces concurrent work and clears the registry after success", async () => {
  const registry = new Map<string, Promise<number>>();
  let calls = 0;
  let resolveTask!: (value: number) => void;

  const task = () => {
    calls += 1;
    return new Promise<number>((resolve) => {
      resolveTask = resolve;
    });
  };

  const first = runSingleFlight(registry, "home", task);
  const second = runSingleFlight(registry, "home", task);
  assert.equal(first, second);
  assert.equal(calls, 1);

  resolveTask(42);
  assert.deepEqual(await Promise.all([first, second]), [42, 42]);
  await Promise.resolve();
  assert.equal(registry.size, 0);
});

test("clears rejected work so a later request can retry", async () => {
  const registry = new Map<string, Promise<number>>();
  let calls = 0;
  const failingTask = async () => {
    calls += 1;
    throw new Error("failed");
  };

  await assert.rejects(runSingleFlight(registry, "home", failingTask), /failed/);
  await Promise.resolve();
  assert.equal(registry.size, 0);

  const value = await runSingleFlight(registry, "home", async () => {
    calls += 1;
    return 7;
  });
  assert.equal(value, 7);
  assert.equal(calls, 2);
});
