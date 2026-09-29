// Keeps results in this server instance's memory for `ttlMs`, so warm requests skip
// re-downloading and re-parsing large cached data (saves CPU time on Vercel).
export function memo<A extends unknown[], T>(ttlMs: number, fn: (...args: A) => Promise<T>) {
  const store = new Map<string, { at: number; value: Promise<T> }>();
  return (...args: A): Promise<T> => {
    const key = JSON.stringify(args);
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = fn(...args);
    store.set(key, { at: Date.now(), value });
    value.catch(() => store.delete(key));
    return value;
  };
}
