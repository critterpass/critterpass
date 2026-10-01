/**
 * What a pass still needs before it can be issued. An invite link carries the name and home the
 * inviter knows; a code carries neither, so the pass page asks for them: the name first, then home.
 */
import { t } from '@lingui/core/macro';

export type MissingPassPart = 'name' | 'home';

export function missingPassPart(draft: {
  readonly given_name: string;
  readonly home_iata: string | null;
}): MissingPassPart | null {
  if (draft.given_name.trim().length === 0) return 'name';
  return draft.home_iata === null ? 'home' : null;
}

/** The button that asks for the missing part, on the pass page and in its edit sheet. */
export function passAskLabel(missing: MissingPassPart): string {
  return missing === 'name'
    ? t({ id: 'onboarding.invite.pass.addName', message: 'Add your name' })
    : t({ id: 'onboarding.invite.pass.addHome', message: 'Add your home airport' });
}
