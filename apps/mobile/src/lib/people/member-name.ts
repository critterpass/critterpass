/**
 * How a member's name is shown. Someone whose account was erased keeps their place in the crew's
 * history with no name left (`users.display_name` is cleared); they read "Former member"
 * everywhere, never as a blank. One helper, so every screen says it the same way.
 */
import { t } from '@lingui/core/macro';

import { familyNameFirst, nameWords } from '@cp/domain';

export function formerMemberLabel(): string {
  return t({ id: 'common.member.former', message: 'Former member' });
}

/** True for a name that is gone (empty), or already the former-member label. */
export function isFormerMember(name: string | null | undefined): boolean {
  const trimmed = name?.trim() ?? '';
  return trimmed === '' || trimmed === formerMemberLabel();
}

/** The full name, or "Former member". */
export function memberName(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim() ?? '';
  return trimmed === '' ? formerMemberLabel() : trimmed;
}

export interface ShortNameOptions {
  /** The name the person asked to be called by, when the profile keeps one apart. */
  readonly givenName?: string | null;
}

/**
 * The name a person is called by, the way their name is ordered: the given name of a family-name
 * first name ("Hân" of "Đặng Thị Ngọc Hân"), the first name of a Western one ("Maya" of "Maya
 * Tan"). A stored given name wins; a name of one word, or one with no letters (an emoji), is kept
 * whole; a name that is gone reads "Former member".
 */
export function shortName(
  displayName: string | null | undefined,
  { givenName }: ShortNameOptions = {},
): string {
  const given = givenName?.trim() ?? '';
  if (given !== '') return given;
  const words = nameWords(displayName ?? '');
  if (words.length === 0) {
    const whole = displayName?.trim() ?? '';
    return whole === '' ? formerMemberLabel() : whole;
  }
  const picked = familyNameFirst(words) ? words[words.length - 1] : words[0];
  return picked ?? formerMemberLabel();
}

/** The short name ("Maya" of "Maya Tan", "Hân" of "Đặng Thị Ngọc Hân"), or "Former member". */
export function memberFirstName(displayName: string | null | undefined): string {
  return shortName(displayName);
}
