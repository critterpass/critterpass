/**
 * An issue's identity across runs: its kind, its day and the items (or booking) it is about. An
 * unchanged issue keeps its fingerprint, so the app keeps its place and a dismissed issue stays
 * dismissed while it holds.
 */
import type { CheckIssueDraft } from './types';

const MAX_LENGTH = 200;

/** FNV-1a, 32-bit, hex: a short stable digest for keys that would run long. */
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function fingerprintOf(issue: CheckIssueDraft): string {
  const subject =
    issue.kind === 'booking_note'
      ? [String(issue.params['booking_id'])]
      : [...issue.stableIds].sort();
  const key = `${issue.kind}:${issue.dayId ?? '-'}:${subject.join(',')}`;
  return key.length <= MAX_LENGTH ? key : `${issue.kind}:${issue.dayId ?? '-'}:${digest(key)}`;
}
