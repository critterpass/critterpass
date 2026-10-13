/** The lock-screen offer's words for each phase, shared by both looks. */
import { useLingui } from '@lingui/react/macro';

import type { OfferFacts, OfferPhase } from './offer-model';

export interface OfferCopy {
  /** The trip's place, or "This trip". */
  readonly trip: string;
  readonly title: string;
  readonly line: string;
}

export function useOfferCopy(
  facts: OfferFacts,
  phase: OfferPhase,
  startsTime: string | null,
): OfferCopy {
  const { t } = useLingui();
  const trip = facts.tripName ?? t({ id: 'trip.lockScreen.thisTrip', message: 'This trip' });
  const count = facts.crew.length;
  const place = facts.meetup?.placeName ?? '';

  let title: string;
  let line: string;
  if (phase.kind === 'started') {
    title = t({ id: 'trip.lockScreen.started.title', message: 'On every lock screen' });
    line =
      startsTime === null
        ? t({
            id: 'trip.lockScreen.started.now',
            message: `The meet-up at ${place} is going to all ${count} lock screens now. It ends by itself once everyone is there.`,
          })
        : t({
            id: 'trip.lockScreen.started.later',
            message: `The meet-up at ${place} goes to all ${count} lock screens at ${startsTime}, half an hour before. It ends by itself once everyone is there.`,
          });
  } else if (phase.kind === 'no_meetup') {
    title = t({ id: 'trip.lockScreen.noMeetup.title', message: 'Set a meet-up first' });
    line = t({
      id: 'trip.lockScreen.noMeetup.line',
      message:
        'The lock screen follows a meet-up. Set one on the crew map and it goes to every phone half an hour before.',
    });
  } else if (phase.kind === 'unavailable') {
    title = t({ id: 'trip.lockScreen.unavailable.title', message: 'Not right now' });
    line =
      phase.why === 'offline'
        ? t({
            id: 'trip.lockScreen.unavailable.offline',
            message:
              "You're offline, so this couldn't reach the crew's phones. Try again when you're back.",
          })
        : phase.why === 'switched_off'
          ? t({
              id: 'trip.lockScreen.unavailable.switchedOff',
              message: 'The crew lock screen is switched off for now. The crew map still works.',
            })
          : t({
              id: 'trip.lockScreen.unavailable.failed',
              message: "That didn't go through. Try again in a moment.",
            });
  } else {
    title = t({ id: 'trip.lockScreen.offer.title', message: 'On every lock screen' });
    line = t({
      id: 'trip.lockScreen.offer.line',
      message: `On a boosted trip the meet-up, ETAs and SOS sit on all ${count} lock screens and in the Dynamic Island. It switches off at midnight on the last day.`,
    });
  }

  return { trip, title, line };
}
