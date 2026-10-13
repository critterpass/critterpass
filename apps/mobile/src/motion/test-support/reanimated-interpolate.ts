/** The Reanimated stand-in's value helpers: interpolation between stops, and reactions it cannot run. */
/** Reanimated's `interpolate`: linear between stops, clamped when asked (or past the ends). */
export function interpolate(
  value: number,
  input: readonly number[],
  output: readonly number[],
  extrapolate?: string | { readonly extrapolateLeft?: string; readonly extrapolateRight?: string },
): number {
  const clamp =
    extrapolate === 'clamp' ||
    (typeof extrapolate === 'object' &&
      (extrapolate.extrapolateLeft === 'clamp' || extrapolate.extrapolateRight === 'clamp'));
  for (let i = 0; i < input.length - 1; i += 1) {
    const from = input[i] ?? 0;
    const to = input[i + 1] ?? 0;
    const last = i === input.length - 2;
    if (value <= to || last) {
      const span = to - from;
      const t = span === 0 ? 0 : (value - from) / span;
      const bounded = clamp ? Math.min(1, Math.max(0, t)) : t;
      return (output[i] ?? 0) + bounded * ((output[i + 1] ?? 0) - (output[i] ?? 0));
    }
  }
  return output[0] ?? 0;
}

export const Extrapolation = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' } as const;

/** A colour between stops, as the nearest stop (Jest draws no in-between frames). */
export function interpolateColor(
  value: number,
  input: readonly number[],
  output: readonly string[],
): string {
  let nearest = 0;
  input.forEach((stop, index) => {
    if (Math.abs(stop - value) < Math.abs((input[nearest] ?? 0) - value)) nearest = index;
  });
  return output[nearest] ?? output[0] ?? 'transparent';
}

/** Reactions to shared values run on the UI thread, which Jest does not have. */
export function useAnimatedReaction(): void {}
