const OPEN_MS = 45_000;
const FAILURE_THRESHOLD = 4;

type BreakerState = {
  failures: number;
  openUntil: number;
};

const states = new Map<string, BreakerState>();

function getState(key: string): BreakerState {
  let s = states.get(key);
  if (!s) {
    s = { failures: 0, openUntil: 0 };
    states.set(key, s);
  }
  return s;
}

export function isCircuitOpen(providerKey: string): boolean {
  const s = getState(providerKey);
  return Date.now() < s.openUntil;
}

export function recordSuccess(providerKey: string): void {
  const s = getState(providerKey);
  s.failures = 0;
  s.openUntil = 0;
}

export function recordFailure(providerKey: string): void {
  const s = getState(providerKey);
  s.failures += 1;
  if (s.failures >= FAILURE_THRESHOLD) {
    s.openUntil = Date.now() + OPEN_MS;
    s.failures = 0;
  }
}

export function resetCircuitBreakersForTests(): void {
  states.clear();
}
