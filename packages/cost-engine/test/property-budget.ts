// 10k generated cases per property run several seconds on a shared CI runner; this budget is for
// that volume, not for a slow implementation (unit cases keep Vitest's default timeout).
export const PROPERTY_SUITE_OPTIONS = { timeout: 60_000 } as const;
