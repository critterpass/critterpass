/** The words the merge choice uses, shared by the current and the premium save sheet. */
import { t } from '@lingui/core/macro';

import type { SaveProvider } from './use-save-flow';

/** "Your Google account", "Your Apple ID", "Your number": the identity the old pass holds. */
export function identityName(provider: SaveProvider): string {
  switch (provider) {
    case 'google':
      return t({ id: 'onboarding.merge.identity.google', message: 'Your Google account' });
    case 'apple':
      return t({ id: 'onboarding.merge.identity.apple', message: 'Your Apple ID' });
    case 'phone':
      return t({ id: 'onboarding.merge.identity.phone', message: 'Your number' });
  }
}

/** The merge choice's line: the identity already holds a pass. */
export function mergeBody(provider: SaveProvider): string {
  const identity = identityName(provider);
  return t({
    id: 'onboarding.merge.bodyFor',
    message: `${identity} is saved to a pass you made before. Switch to it to pick up where you left off.`,
  });
}

/** After "Keep this new pass": what that means. */
export function keptBody(provider: SaveProvider): string {
  const identity = identityName(provider);
  return t({
    id: 'onboarding.merge.keptBody',
    message: `${identity} stays with your old pass, and this phone keeps the new one. To save the new pass, use a different sign-in.`,
  });
}

/** The kept explanation closed: the sheet's reminder line. */
export function declinedLine(provider: SaveProvider): string {
  const identity = identityName(provider);
  return t({
    id: 'onboarding.merge.declinedLine',
    message: `${identity} stays with your old pass. Use another sign-in to save this one.`,
  });
}
