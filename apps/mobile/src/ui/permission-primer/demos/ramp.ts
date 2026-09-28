/**
 * Piecewise-linear map of `value` through `input` → `output` stops, clamped at both ends (the
 * subset of Reanimated's `interpolate` the demos need, as a plain worklet).
 */
export function ramp(value: number, input: readonly number[], output: readonly number[]): number {
  'worklet';
  const last = input.length - 1;
  if (value <= (input[0] ?? 0)) return output[0] ?? 0;
  if (value >= (input[last] ?? 1)) return output[last] ?? 0;
  for (let i = 1; i <= last; i += 1) {
    const hi = input[i] ?? 1;
    if (value <= hi) {
      const lo = input[i - 1] ?? 0;
      const from = output[i - 1] ?? 0;
      const to = output[i] ?? 0;
      return hi === lo ? to : from + ((to - from) * (value - lo)) / (hi - lo);
    }
  }
  return output[last] ?? 0;
}
