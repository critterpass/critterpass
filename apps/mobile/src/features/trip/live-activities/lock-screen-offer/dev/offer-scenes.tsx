/**
 * The lock-screen sheet's states with fixed data, for the trip day lab and its screenshot flows:
 * the offer on an unboosted trip (5a-6, with and without a registered Boost button), the
 * confirmation on a boosted one, and the trip with no meet-up yet.
 */
/* eslint-disable lingui/no-unlocalized-strings -- lab fixtures: sample names, places and times. */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles } from '@/ui/theme';

import { LockScreenOfferSheet } from '../lock-screen-offer-sheet';
import type { OfferFacts, OfferPhase } from '../offer-model';

const FACTS: OfferFacts = {
  tripName: 'Kyoto',
  meetup: { placeName: 'Campuhan Ridge', meetAt: new Date('2026-10-17T09:00:00Z') },
  crew: ['Dev', 'Jordan', 'Alex', 'Rin', 'Maya', 'Wen'],
};

const useStyles = makeStyles((th) => ({
  map: { flex: 1, backgroundColor: th.color.map.base },
}));

function Scene({ phase, priced }: { readonly phase: OfferPhase; readonly priced: boolean }) {
  const styles = useStyles();
  const nothing = () => undefined;
  return (
    <View style={styles.map}>
      <LockScreenOfferSheet
        facts={FACTS}
        phase={phase}
        clock="16:38"
        meetTime="17:00"
        startsTime={phase.kind === 'started' ? '16:30' : null}
        boost={priced ? { price: '$12', onPress: nothing } : null}
        onRetry={nothing}
        onClose={nothing}
      />
    </View>
  );
}

export const LOCK_SCREEN_OFFER_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '5a-6-offer': () => <Scene phase={{ kind: 'offer' }} priced />,
  '5a-6-offer-no-paywall': () => <Scene phase={{ kind: 'offer' }} priced={false} />,
  '5a-6-started': () => (
    <Scene
      phase={{ kind: 'started', meetupId: 'meetup', startsAt: '2026-10-17T08:30:00Z' }}
      priced={false}
    />
  ),
  '5a-6-no-meetup': () => <Scene phase={{ kind: 'no_meetup' }} priced={false} />,
};
