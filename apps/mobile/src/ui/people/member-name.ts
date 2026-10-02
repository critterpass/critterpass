/**
 * How a member's name is shown. Someone whose account was erased keeps their place in the crew's
 * history with no name left (`users.display_name` is cleared); they read "Former member"
 * everywhere, never as a blank. One helper, so every screen says it the same way.
 */
import { t } from '@lingui/core/macro';

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

/** The first name ("Maya" of "Maya Tan"), or "Former member". */
export function memberFirstName(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/u)[0] ?? '';
  return first === '' ? formerMemberLabel() : first;
}
