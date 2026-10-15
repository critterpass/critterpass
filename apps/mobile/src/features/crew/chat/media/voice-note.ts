/** A voice note's waveform bars, its clock and what assistive tech reads for it. */
import { t } from '@lingui/core/macro';

export const WAVEFORM_BARS = 32;

/** `peaks` resampled to `bars` bars (a flat line when there are none yet). */
export function bars(peaks: readonly number[] | undefined, count = WAVEFORM_BARS): number[] {
  if (peaks === undefined || peaks.length === 0) return Array.from({ length: count }, () => 0.15);
  return Array.from({ length: count }, (_, index) => {
    const peak = peaks[Math.floor((index / count) * peaks.length)] ?? 0;
    return Math.max(0.1, peak);
  });
}

export function clock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function voiceLabel(durationMs: number): string {
  const length = clock(durationMs);
  return t({ id: 'chat.voice.label', message: `Voice note, ${length}` });
}
