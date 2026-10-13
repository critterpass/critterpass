/**
 * `/map/crew/{crewId}` (the chat's MAP pill): opens the crew map of the crew's trip that is under
 * way, or of the next one; with no trip at all, says so as a push with the sleeping guide and
 * the way back to the chat.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { t } from '@lingui/core/macro';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { guideCritterKind, guideCritterName } from '@/features/trip';
import { Button, EmptyState, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { quoted } from '../chat/data/rows';

function noTripCopy() {
  return {
    title: t({ id: 'liveMap.noTrip.title', message: 'No trip on the map yet' }),
    line: t({
      id: 'liveMap.noTrip.line',
      message: 'The crew map opens on the days of a trip you take together.',
    }),
    back: t({ id: 'liveMap.noTrip.back', message: 'Back to the chat' }),
  };
}

function NoTrip({ loading }: { readonly loading: boolean }) {
  const th = usePremiumTheme();
  const copy = noTripCopy();
  if (loading) return <View style={{ flex: 1, backgroundColor: th.color.ground }} />;
  return (
    <PushScreen
      title={t({ id: 'liveMap.premium.crewMap', message: 'Crew map' })}
      backLabel={t({ id: 'liveMap.premium.back', message: 'Back' })}
      testID="live-no-trip"
    >
      <View style={{ paddingTop: 80 }}>
        <EmptyState
          title={copy.title}
          line={copy.line}
          critter={{ kind: guideCritterKind('tokek'), name: guideCritterName('tokek') }}
          check={false}
          action={
            <Button
              label={copy.back}
              variant="secondary"
              size="medium"
              onPress={() => router.back()}
            />
          }
        />
      </View>
    </PushScreen>
  );
}

export function CrewMapRedirect() {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const { db } = useLocalFirst();
  const [trip, setTrip] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void db
      .getOptional<{ id: string }>(
        `SELECT id FROM trips WHERE crew_id = ${quoted(crewId)}
            AND status IN ('in_trip', 'pre_trip', 'confirmed')
          ORDER BY (status = 'in_trip') DESC, start_date ASC LIMIT 1`,
      )
      .then(
        (row) => setTrip(row?.id ?? null),
        () => setTrip(null),
      );
  }, [db, crewId]);
  if (trip !== null && trip !== undefined) return <Redirect href={`/map/${trip}?from=chat`} />;
  return <NoTrip loading={trip === undefined} />;
}
