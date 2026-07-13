/** Coalesce concurrent work for the same in-process key. */
export function runSingleFlight<Key, Value>(
  registry: Map<Key, Promise<Value>>,
  key: Key,
  task: () => Promise<Value>,
): Promise<Value> {
  const existing = registry.get(key);
  if (existing) return existing;

  const promise = task();
  registry.set(key, promise);

  const cleanup = () => {
    if (registry.get(key) === promise) registry.delete(key);
  };
  // Attach both handlers so cleanup never creates an unhandled rejection.
  void promise.then(cleanup, cleanup);

  return promise;
}
