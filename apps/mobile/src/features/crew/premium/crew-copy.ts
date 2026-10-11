/**
 * Lines the premium crew pages share: why a start did not go through, how an earned cover is
 * earned, the invite message, the code's expiry and a member's first name.
 */
import { t } from '@lingui/core/macro';

import type { CrewCover } from '@cp/domain';

import { memberFirstName } from '@/ui/people/member-name';

import type { StartStep } from '../start-crew/use-start-crew';

export function startNote(step: StartStep, refusal: string | null, slow: boolean): string | null {
  if (step.kind === 'failed') {
    return refusal === 'crew_limit'
      ? t({
          id: 'crew.start.crewLimit',
          message: 'You’re in ten crews already. Leave one to start another.',
        })
      : t({
          id: 'crew.start.didNotGoThrough',
          message: 'That didn’t go through. Check your signal and try again.',
        });
  }
  if (step.kind === 'not_ready') {
    return t({
      id: 'crew.start.notReady',
      message: 'Still getting your pass ready. Try again in a moment.',
    });
  }
  if (slow) {
    return t({
      id: 'crew.start.slow',
      message: 'Still working on it. The connection is slow; this can take a little while.',
    });
  }
  return null;
}

export function coverLockedNote(cover: CrewCover): string {
  return cover === 'collector'
    ? t({
        id: 'crew.premium.cover.lockedCollector',
        message: 'Five friends who join and plan a trip unlock the Collector cover.',
      })
    : t({
        id: 'crew.premium.cover.lockedNavy',
        message: 'Three friends who join and plan a trip unlock the Navy cover.',
      });
}

export function inviteMessage(crew: string, url: string, code: string): string {
  return t({
    id: 'crew.premium.inviteMessage',
    message: `Join ${crew} on CritterPass: ${url} (code ${code})`,
  });
}

/** "Works until 24 Oct" from the code's own expiry; null when the server set none. */
export function codeValidLine(expiresAt: string | null, locale: string): string | null {
  if (expiresAt === null) return null;
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return null;
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(at);
  return t({ id: 'crew.premium.code.until', message: `Works until ${date}` });
}

export function firstName(displayName: string | null): string {
  return memberFirstName(displayName);
}

/** A crew trip's status as one word for its row. */
export function tripStatusWord(status: string): string {
  if (status === 'in_trip') return t({ id: 'crew.premium.trip.on', message: 'On now' });
  if (status === 'voting') return t({ id: 'crew.premium.trip.voting', message: 'Voting' });
  return t({ id: 'crew.premium.trip.planning', message: 'Planning' });
}
