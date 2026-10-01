/** Plain-number `Intl` wrappers (design-system.md §6 "Numbers & currency"); currency itself is
 * formatted by the money primitives phase, which layers a currency code onto these. */

const COMPACT_STEPS: readonly (readonly [number, string])[] = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

export function number(locale: string, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** e.g. "1.2K", "3M" — crew/trip counters and hype percentages that must not wrap. */
export function compactNumber(locale: string, value: number): string {
  const full = new Intl.NumberFormat(locale).format(value);
  const native = new Intl.NumberFormat(locale, { notation: 'compact' }).format(value);
  if (native !== full || Math.abs(value) < 1000) return native;
  // Hermes on iPhone ignores compact notation and writes the number out: scale it here.
  const [size, suffix] = COMPACT_STEPS.find(([step]) => Math.abs(value) >= step) ?? [1, ''];
  const scaled = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / size);
  return `${scaled}${suffix}`;
}

/** `value` is a fraction (0.42, not 42); rounds to whole percent per design-system.md's hype/plan meters. */
export function percent(locale: string, value: number): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    value,
  );
}

/**
 * "17D" style countdown units (design-system.md §6): a plain narrow-unit number, sentence case.
 * Callers apply `upper()` for the design's all-caps countdown chip, matching the casing rule that
 * uppercasing is a render-time transform, not baked into the formatted string.
 */
export function countdownUnit(
  locale: string,
  value: number,
  unit: 'day' | 'hour' | 'minute' | 'second',
): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow' }).format(
    value,
  );
}
