/** Simple token bucket per key (e.g. hostname). */
const buckets = new Map<string, { tokens: number; updatedAt: number }>();

export async function takeToken(
  key: string,
  opts?: { capacity?: number; refillPerSecond?: number }
): Promise<void> {
  const capacity = opts?.capacity ?? 10;
  const refillPerSecond = opts?.refillPerSecond ?? 5;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: capacity, updatedAt: now };
    buckets.set(key, b);
  }
  const elapsed = (now - b.updatedAt) / 1000;
  b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSecond);
  b.updatedAt = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return;
  }
  const waitMs = Math.ceil((1 - b.tokens) / refillPerSecond * 1000);
  b.tokens = 0;
  await new Promise((r) => setTimeout(r, Math.min(waitMs, 2000)));
}
