/**
 * The lock-screen sheet over the crew map (5a-6): asks the server once, as it opens, to put the
 * trip's meet-up on every member's lock screen, and shows what came back.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a command name, never copy. */
import type { RequestCrewLockScreenPayload } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useState } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';

import { tripHubRoute } from '../../hub/routes';
import { lockScreenBoost } from './boost-slot';
import { LockScreenOfferSheet } from './lock-screen-offer-sheet';
import { useOfferData } from './offer-data';
import { clockTime, phaseFor, startsLater, type OfferPhase } from './offer-model';

export const REQUEST_CREW_LOCK_SCREEN = defineClientCommand<RequestCrewLockScreenPayload>({
  name: 'request_crew_lock_screen',
  offline: false,
});

export function LockScreenOfferScreen({ tripId }: { readonly tripId: string }) {
  const { i18n } = useLingui();
  const { facts, tz } = useOfferData(tripId);
  const { send } = useCommand(REQUEST_CREW_LOCK_SCREEN);
  const [phase, setPhase] = useState<OfferPhase>({ kind: 'asking' });
  const [opened] = useState(() => new Date());

  const ask = useCallback(() => {
    send({ trip_id: tripId }).then(
      (outcome) => setPhase(phaseFor(outcome)),
      () => setPhase({ kind: 'unavailable', why: 'failed' }),
    );
  }, [send, tripId]);
  // Opening the sheet is the request: the member tapped "put this on the lock screen".
  useEffect(() => {
    ask();
  }, [ask]);
  const retry = useCallback(() => {
    setPhase({ kind: 'asking' });
    ask();
  }, [ask]);

  const close = useCallback(() => {
    goBackOr(tripHubRoute(tripId));
  }, [tripId]);
  const paywall = lockScreenBoost();
  return (
    <LockScreenOfferSheet
      facts={facts}
      phase={phase}
      clock={clockTime(opened, i18n.locale, null)}
      meetTime={facts.meetup === null ? null : clockTime(facts.meetup.meetAt, i18n.locale, tz)}
      startsTime={
        phase.kind === 'started' && startsLater(phase.startsAt, opened)
          ? clockTime(new Date(phase.startsAt), i18n.locale, tz)
          : null
      }
      boost={
        paywall === null ? null : { price: paywall.price(), onPress: () => paywall.open(tripId) }
      }
      onRetry={retry}
      onClose={close}
    />
  );
}
