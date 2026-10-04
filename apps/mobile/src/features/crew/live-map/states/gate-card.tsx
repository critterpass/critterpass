/**
 * The crew map when it is closed: not boosted (or the Boost ended mid-trip: the map freezes, and
 * nobody's positions are kept), outside trip days (with the date sharing starts, or that it has
 * ended), or you are no longer on the trip. One card over the map, the guide's voice.
 */
import { t } from '@lingui/core/macro';

import { guideSticker } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';
import { EmptyState } from '@/ui/states/EmptyState';
import { makeStyles } from '@/ui/theme';
import { View } from 'react-native';

import type { LiveGate } from '../data/use-live-fixes';
import { liveMapPaywall } from '../gate-slot';

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    marginHorizontal: th.space['16'],
  },
}));

export function GateCard({
  gate,
  tripId,
  startsOn,
  ended,
}: {
  readonly gate: Exclude<LiveGate, 'open' | 'loading'>;
  readonly tripId: string;
  /** "Oct 15", when sharing has not started yet. */
  readonly startsOn: string | null;
  readonly ended: boolean;
}) {
  const styles = useStyles();
  const guide = guideSticker('tokek');
  const paywall = liveMapPaywall();
  const sticker = <Sticker kind={guide.kind} name={guide.name} size={72} />;
  let title: string;
  let line: string;
  let action: { label: string; onPress: () => void } | undefined;
  if (gate === 'boost_required') {
    title = t({ id: 'liveMap.gate.boostTitle', message: 'See the crew live' });
    line = t({
      id: 'liveMap.gate.boostLine',
      message: "Boost this trip to share live locations on trip days. Nobody's history is kept.",
    });
    action =
      paywall === null
        ? undefined
        : {
            label: t({ id: 'liveMap.gate.boostAction', message: 'See Boost' }),
            onPress: () => paywall(tripId),
          };
  } else if (gate === 'outside_trip_days') {
    title = ended
      ? t({ id: 'liveMap.gate.endedTitle', message: 'Trip days are over' })
      : t({ id: 'liveMap.gate.notStartedTitle', message: 'Not a trip day yet' });
    line = ended
      ? t({ id: 'liveMap.gate.endedLine', message: 'Sharing switched itself off at midnight.' })
      : startsOn === null
        ? t({ id: 'liveMap.gate.notStartedLine', message: 'Sharing opens on your first trip day.' })
        : t({ id: 'liveMap.gate.startsOn', message: `Sharing opens on ${startsOn}.` });
  } else {
    title = t({ id: 'liveMap.gate.offTripTitle', message: "You're not on this trip" });
    line = t({
      id: 'liveMap.gate.offTripLine',
      message: 'Only people on the trip see the crew map.',
    });
  }
  return (
    <View style={styles.card} testID={`live-gate-${gate}`}>
      <EmptyState
        guide="tokek"
        guideName={guide.name}
        sticker={sticker}
        title={title}
        line={line}
        {...(action === undefined ? {} : { action })}
      />
    </View>
  );
}
