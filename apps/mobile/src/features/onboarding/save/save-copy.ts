/** The save sheet's error lines, shared by the current and the premium sheet. */
import { t } from '@lingui/core/macro';

import type { SaveError } from './use-save-flow';

export function saveErrorLine(reason: SaveError): string {
  switch (reason) {
    case 'network':
      return t({
        id: 'onboarding.save.error.network',
        message: 'No signal right now. Your pass is safe on this phone; try again in a moment.',
      });
    case 'different_email':
      return t({
        id: 'onboarding.save.error.email',
        message: 'That account uses a different email. Try another way.',
      });
    case 'unavailable':
      return t({
        id: 'onboarding.save.error.unavailable',
        message: 'That sign-in isn’t available on this phone. Try another way.',
      });
    case 'cancelled':
      return t({
        id: 'onboarding.save.error.cancelled',
        message: 'Google sign-in didn’t finish. Try again, or use another way.',
      });
    case 'merge_expired':
      return t({
        id: 'onboarding.save.error.expired',
        message: 'That took a while. Sign in again to continue.',
      });
    case 'unknown':
      return t({
        id: 'onboarding.save.error.unknown',
        message: 'That didn’t work. Try again, or use another way.',
      });
  }
}
