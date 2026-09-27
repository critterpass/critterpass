/**
 * Boundary validation for the waitlist join endpoint: the same email shape the design's own client
 * check uses, plus the honeypot and payload-size guards a public POST endpoint needs.
 */

// Mirrors the design's own client-side check (`^[^\s@]+@[^\s@]+\.[^\s@]+$`) — permissive but rejects
// obviously malformed input; deliverability is out of scope for a waitlist form.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

/** Normalises an email for storage/lookup (trim + lowercase) and validates its shape. Returns `null` when invalid. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > MAX_EMAIL_LENGTH) return null;
  if (!EMAIL_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/** A non-empty honeypot field means a bot filled in a field real users never see. */
export function isHoneypotTripped(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Rejects request bodies larger than a join payload could legitimately need. */
export const MAX_JOIN_BODY_BYTES = 4096;

export function isBodyTooLarge(contentLength: string | null): boolean {
  if (contentLength === null) return false;
  const bytes = Number.parseInt(contentLength, 10);
  return Number.isFinite(bytes) && bytes > MAX_JOIN_BODY_BYTES;
}
