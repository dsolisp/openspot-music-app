/** TanStack Query keys for OpenSpot. */
export const openQueryKeys = {
  search: (q: string, type: string) => ['search', q.trim(), type] as const,
  trending: () => ['browse', 'trending'] as const,
} as const;
