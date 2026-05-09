/** Exponential backoff with jitter. Optional `retryAfterMs` from Retry-After (seconds). */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { retries?: number; baseMs?: number; maxMs?: number; retryAfterMs?: number }
): Promise<T> {
  const retries = options?.retries ?? 2;
  const baseMs = options?.baseMs ?? 400;
  const maxMs = options?.maxMs ?? 8000;
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt >= retries) break;
      const cap =
        options?.retryAfterMs != null
          ? Math.min(options.retryAfterMs, maxMs)
          : Math.min(baseMs * 2 ** attempt + Math.random() * 250, maxMs);
      await new Promise((r) => setTimeout(r, cap));
    }
  }
  throw last;
}

export function parseRetryAfterMs(res: Response): number | undefined {
  const h = res.headers.get('retry-after');
  if (!h) return undefined;
  const sec = Number.parseInt(h, 10);
  if (!Number.isFinite(sec)) return undefined;
  return sec * 1000;
}
