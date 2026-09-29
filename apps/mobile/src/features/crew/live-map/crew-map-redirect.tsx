/**
 * `/map/crew/{crewId}` (the chat's MAP pill): opens the crew map of the crew's trip that is under
 * way, or of the next one; with no trip at all, says so.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { t } from '@lingui/core/macro';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { EmptyState } from '@/ui/states/EmptyState';
import { Sticker } from '@/ui/sticker/Sticker';
import { useTheme } from '@/ui';

import { quoted } from '../chat/data/rows';

export function CrewMapRedirect() {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const { db } = useLocalFirst();
  const theme = useTheme();
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
  if (trip === undefined)
    return <View style={{ flex: 1, backgroundColor: theme.color.map.base }} />;
  if (trip !== null) return <Redirect href={`/map/${trip}?from=chat`} />;
  const guide = GUIDE_STICKERS.tokek;
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.semantic.bg.base }}>
      <EmptyState
        guide="tokek"
        guideName={guide.name}
        sticker={<Sticker kind={guide.kind} name={guide.name} size={72} />}
        title={t({ id: 'liveMap.noTrip.title', message: 'No trip on the map yet' })}
        line={t({
          id: 'liveMap.noTrip.line',
          message: 'The crew map opens on the days of a trip you take together.',
        })}
        testID="live-no-trip"
      />
      <View style={{ paddingHorizontal: theme.space['24'] }}>
        <PillButton
          label={t({ id: 'liveMap.noTrip.back', message: 'Back to the chat' })}
          variant="secondary"
          onPress={() => router.back()}
          block
        />
      </View>
    </View>
  );
}
