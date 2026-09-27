/* eslint-disable lingui/no-unlocalized-strings -- not JSX; see src/lib/guides.ts for why. */
/**
 * Referral handles: `critterpass.app/w/<handle>`, derived from the email's local part like the
 * design's own client-side preview, made unique with a short numeric suffix when taken.
 */
const MAX_BASE_LENGTH = 10;
const FALLBACK_HANDLE = 'friend';
const MAX_SUFFIX_ATTEMPTS = 50;

/** Lowercases the email's local part and strips everything but letters/digits, same as the design script. */
export function deriveHandleBase(email: string): string {
  const localPart = email.split('@')[0] ?? '';
  const cleaned = localPart
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, MAX_BASE_LENGTH);
  return cleaned.length > 0 ? cleaned : FALLBACK_HANDLE;
}

/**
 * Finds the first free handle starting from `base`: `base`, then `base2`, `base3`, ... `isTaken`
 * is called synchronously in ascending suffix order so the caller can back it with a single
 * indexed lookup per attempt.
 */
export function resolveUniqueHandle(base: string, isTaken: (candidate: string) => boolean): string {
  if (!isTaken(base)) return base;
  for (let suffix = 2; suffix <= MAX_SUFFIX_ATTEMPTS; suffix += 1) {
    const candidate = `${base}${suffix}`;
    if (!isTaken(candidate)) return candidate;
  }
  throw new Error(`handle: exhausted ${MAX_SUFFIX_ATTEMPTS} suffix attempts for base "${base}"`);
}
