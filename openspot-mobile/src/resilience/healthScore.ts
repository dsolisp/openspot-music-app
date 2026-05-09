/** Lower score = healthier (expected latency ms). */
const emaMs = new Map<string, number>();

export function recordHostOutcome(host: string, ok: boolean, latencyMs: number): void {
  const prev = emaMs.get(host) ?? 800;
  // ARCHITECT'S CHOICE: If a host fails, treat it as having 30s latency to bury it in the sorted list.
  const observed = ok ? latencyMs : 30_000;
  // Slow down recovery decay (0.8 instead of 0.65) to keep bad hosts buried longer.
  emaMs.set(host, prev * 0.8 + observed * 0.2);
}

export function sortHostsByHealth(hosts: string[]): string[] {
  return [...hosts].sort((a, b) => {
    const ha = emaMs.get(hostKey(a)) ?? 800;
    const hb = emaMs.get(hostKey(b)) ?? 800;
    return ha - hb;
  });
}

function hostKey(instanceBaseUrl: string): string {
  try {
    return new URL(instanceBaseUrl.startsWith('http') ? instanceBaseUrl : `https://${instanceBaseUrl}`).hostname;
  } catch {
    return instanceBaseUrl;
  }
}
