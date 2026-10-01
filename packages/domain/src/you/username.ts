/**
 * Username rules (3n-3): 3–20 characters of `[a-z0-9_.]`, no leading, trailing or doubled dot,
 * not a reserved word, changed at most once every 30 days. Uniqueness is case-insensitive
 * (`users.username` is citext unique); the stored form is always lower case.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_COOLDOWN_DAYS = 30;

const USERNAME_PATTERN = /^[a-z0-9_.]+$/;

/** Names that would impersonate the product, its guides or its staff, or collide with routes. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'critterpass',
  'critter',
  'critters',
  'crew',
  'crews',
  'guide',
  'help',
  'me',
  'mod',
  'moderator',
  'null',
  'official',
  'ops',
  'root',
  'settings',
  'staff',
  'support',
  'system',
  'team',
  'tokek',
  'undefined',
  'you',
]);

export type UsernameProblem = 'too_short' | 'too_long' | 'invalid_chars' | 'dots' | 'reserved';

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The first rule a (normalized) username breaks, or `null` when it may be taken. */
export function usernameProblem(username: string): UsernameProblem | null {
  if (username.length < USERNAME_MIN) return 'too_short';
  if (username.length > USERNAME_MAX) return 'too_long';
  if (!USERNAME_PATTERN.test(username)) return 'invalid_chars';
  if (username.startsWith('.') || username.endsWith('.') || username.includes('..')) return 'dots';
  if (RESERVED_USERNAMES.has(username.replaceAll(/[._]/g, ''))) return 'reserved';
  return null;
}

/**
 * When the next change is allowed, or `null` when it is allowed now. The first username a user
 * picks (no previous change recorded) is never held back.
 */
export function usernameCooldownUntil(changedAt: Date | null, now: Date): Date | null {
  if (changedAt === null) return null;
  const until = new Date(changedAt.getTime() + USERNAME_COOLDOWN_DAYS * 86_400_000);
  return until.getTime() > now.getTime() ? until : null;
}
