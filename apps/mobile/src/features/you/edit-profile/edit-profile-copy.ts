/** Edit profile's words for field problems and the username's live answer. */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';

import type { NameProblem, UsernameState } from './edit-profile-model';

export function nameProblemText(problem: NameProblem): string {
  switch (problem) {
    case 'empty':
      return t({ id: 'you.edit.name.empty', message: 'Your crew needs something to call you.' });
    case 'too_long':
      return t({ id: 'you.edit.name.tooLong', message: 'That’s longer than a pass can fit.' });
    case 'blocked':
      return t({ id: 'you.edit.name.blocked', message: 'Try a different name.' });
  }
}

/** The line under the username, or null when there is nothing to say. */
export function usernameText(state: UsernameState, locale: string): string | null {
  switch (state.kind) {
    case 'unchanged':
      return null;
    case 'checking':
      return t({ id: 'you.edit.username.checking', message: 'Checking…' });
    case 'available':
      return t({ id: 'you.edit.username.available', message: 'It’s yours if you save.' });
    case 'taken':
      return t({ id: 'you.edit.username.taken', message: 'Someone already has that one.' });
    case 'unknown':
      return t({
        id: 'you.edit.username.unknown',
        message: 'Can’t check right now. Saving will tell you.',
      });
    case 'cooldown': {
      const when = format.date(locale, new Date(state.until), { day: 'numeric', month: 'long' });
      return t({
        id: 'you.edit.username.cooldown',
        message: `You changed it recently. You can change it again on ${when}.`,
      });
    }
    case 'invalid':
      switch (state.reason) {
        case 'too_short':
          return t({ id: 'you.edit.username.tooShort', message: 'At least 3 characters.' });
        case 'too_long':
          return t({ id: 'you.edit.username.tooLong', message: 'At most 20 characters.' });
        case 'invalid_chars':
          return t({
            id: 'you.edit.username.chars',
            message: 'Letters, numbers, dots and underscores only.',
          });
        case 'dots':
          return t({
            id: 'you.edit.username.dots',
            message: 'No dot at the start or end, and never two in a row.',
          });
        case 'reserved':
          return t({ id: 'you.edit.username.reserved', message: 'That one’s reserved.' });
      }
  }
}

/** A refused SAVE, from the server's answer. */
export function saveProblemText(code: string, reason: string | null): string {
  if (code === 'STATE_INVALID' && reason === 'username_taken') {
    return t({ id: 'you.edit.save.taken', message: 'Someone took that username just now.' });
  }
  if (code === 'STATE_INVALID' && reason === 'username_cooldown') {
    return t({ id: 'you.edit.save.cooldown', message: 'You changed your username recently.' });
  }
  if (code === 'CONTENT_REJECTED') {
    return t({ id: 'you.edit.save.rejected', message: 'Try a different name.' });
  }
  return t({
    id: 'you.edit.save.failed',
    message: 'Couldn’t save. Check your connection and try again.',
  });
}

/** "Rare form · found Oct 14", for a critter form worn as the avatar. */
export function wornFormLine(rarity: string, foundAt: string | null, locale: string): string {
  const tier =
    rarity === 'legendary'
      ? t({ id: 'you.edit.form.legendary', message: 'Legendary form' })
      : rarity === 'epic'
        ? t({ id: 'you.edit.form.epic', message: 'Epic form' })
        : rarity === 'rare'
          ? t({ id: 'you.edit.form.rare', message: 'Rare form' })
          : t({ id: 'you.edit.form.common', message: 'Common form' });
  if (foundAt === null) return tier;
  const when = format.date(locale, new Date(foundAt), { day: 'numeric', month: 'short' });
  return t({ id: 'you.edit.form.found', message: `${tier} · found ${when}` });
}
