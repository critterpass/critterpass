import { t } from '@lingui/core/macro';

import type { PhoneProblem } from './use-phone-flow';

export function phoneProblemLine(problem: PhoneProblem, retryS: number | null): string {
  switch (problem) {
    case 'invalid_number':
      return t({
        id: 'onboarding.phone.invalid',
        message: 'That number looks short. Check it and try again.',
      });
    case 'country_unsupported':
      return t({
        id: 'onboarding.phone.unsupported',
        message: 'We can’t send codes to that country yet. Use Apple or Google instead.',
      });
    case 'rate_limited':
      return retryS === null
        ? t({
            id: 'onboarding.phone.limited',
            message: 'Too many codes for now. Try again a bit later.',
          })
        : t({
            id: 'onboarding.phone.limitedFor',
            message: `Too many codes for now. Try again in ${Math.max(1, Math.ceil(retryS / 60))} min.`,
          });
    case 'send_failed':
      return t({
        id: 'onboarding.phone.sendFailed',
        message: 'The code didn’t send. Check your signal and try again.',
      });
    case 'wrong_code':
      return t({ id: 'onboarding.phone.wrong', message: 'That code doesn’t match. Try again.' });
    case 'expired':
      return t({
        id: 'onboarding.phone.expired',
        message: 'That code has expired. Send a new one.',
      });
    case 'too_many':
      return t({ id: 'onboarding.phone.tooMany', message: 'Too many tries. Send a new code.' });
  }
}
