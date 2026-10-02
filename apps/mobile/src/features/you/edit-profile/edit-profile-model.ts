/**
 * Edit profile (3n-3) as plain data: the saved profile, the draft the screen edits, what is
 * unsaved, the field problems the screen shows before saving, and the commands SAVE sends (only
 * what changed). The server checks again; these rules only spare a round trip.
 */
import { BLOCKED_NAME_WORDS } from '@cp/content/onboarding';
import {
  givenNameProblem,
  normalizeGivenName,
  normalizeUsername,
  usernameCooldownUntil,
  usernameProblem,
  type UpdateProfilePayload,
  type UsernameProblem,
} from '@cp/domain';

export interface SavedProfile {
  readonly name: string;
  readonly username: string | null;
  readonly homeAirport: string | null;
  /** Languages the person speaks (`users.languages`), in their order. */
  readonly languages: readonly string[];
  /** `users.username_changed_at`; null when the username was never changed. */
  readonly usernameChangedAt: string | null;
}

export interface ProfileDraft {
  readonly name: string;
  readonly username: string;
  readonly homeAirport: string | null;
  readonly languages: readonly string[];
}

export function draftOf(saved: SavedProfile): ProfileDraft {
  return {
    name: saved.name,
    username: saved.username ?? '',
    homeAirport: saved.homeAirport,
    languages: saved.languages,
  };
}

export type NameProblem = 'empty' | 'too_long' | 'blocked';

export function nameProblemOf(name: string): NameProblem | null {
  return givenNameProblem(name, BLOCKED_NAME_WORDS);
}

/** The username as it will be stored, or null when the field is left empty. */
function usernameOf(draft: ProfileDraft): string | null {
  const value = normalizeUsername(draft.username.replace(/^@/, ''));
  return value.length === 0 ? null : value;
}

export interface ProfileChanges {
  /** `update_profile`'s payload, or null when name and username are unchanged. */
  readonly profile: UpdateProfilePayload | null;
  /** The new home airport (`set_home_airport`), or null when unchanged. */
  readonly homeAirport: string | null;
}

export function changesOf(saved: SavedProfile, draft: ProfileDraft): ProfileChanges {
  const profile: { name?: string; username?: string; languages?: string[] } = {};
  const name = normalizeGivenName(draft.name);
  if (name !== saved.name) profile.name = name;
  const username = usernameOf(draft);
  if (username !== null && username !== saved.username) profile.username = username;
  const languages = [...new Set(draft.languages)];
  if (languages.join(',') !== saved.languages.join(',')) profile.languages = languages;
  return {
    profile: Object.keys(profile).length === 0 ? null : profile,
    homeAirport:
      draft.homeAirport !== null && draft.homeAirport !== saved.homeAirport
        ? draft.homeAirport
        : null,
  };
}

export function hasChanges(changes: ProfileChanges): boolean {
  return changes.profile !== null || changes.homeAirport !== null;
}

export type UsernameState =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'invalid'; readonly reason: UsernameProblem }
  /** Changed in the last 30 days: the next change opens on `until`. */
  | { readonly kind: 'cooldown'; readonly until: string }
  | { readonly kind: 'checking' }
  | { readonly kind: 'available' }
  | { readonly kind: 'taken' }
  /** No answer (offline): SAVE still tries, and the server decides. */
  | { readonly kind: 'unknown' };

/** What the username field says before any server answer. Null: ask the server. */
export function usernameLocalState(
  saved: SavedProfile,
  draft: ProfileDraft,
  now: Date,
): UsernameState | null {
  const username = usernameOf(draft);
  if (username === null || username === saved.username) return { kind: 'unchanged' };
  const reason = usernameProblem(username);
  if (reason !== null) return { kind: 'invalid', reason };
  const changedAt = saved.usernameChangedAt === null ? null : new Date(saved.usernameChangedAt);
  const until = usernameCooldownUntil(changedAt, now);
  if (until !== null) return { kind: 'cooldown', until: until.toISOString() };
  return null;
}

/** SAVE is offered when something changed and nothing known is wrong. */
export function canSave(
  changes: ProfileChanges,
  draft: ProfileDraft,
  username: UsernameState,
): boolean {
  if (!hasChanges(changes)) return false;
  if (nameProblemOf(draft.name) !== null) return false;
  return username.kind !== 'invalid' && username.kind !== 'cooldown' && username.kind !== 'taken';
}

/** `users.languages` as the local database holds it: a JSON array, or Postgres array text. */
export function languagesOf(raw: string | null): string[] {
  if (raw === null || raw.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed))
      return parsed.filter((code): code is string => typeof code === 'string');
  } catch {
    // Postgres array text: {en,vi}
  }
  return raw
    .replace(/^\{|\}$/g, '')
    .split(',')
    .map((code) => code.trim().replace(/^"|"$/g, ''))
    .filter((code) => code.length > 0);
}
