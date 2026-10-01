/**
 * The trip hub's QUESTS tile (3k-1): today's live quests and the crew's level ("3 LIVE", "crew level
 * 7"), opening crew quests. Before the first quests land it says when they come (undesigned: the
 * design only shows a day with quests), so the hub keeps its 2×2 grid on every trip day.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { HubTile, type HubTileProps } from '@/features/trip';

import { useQuests } from './use-quests';
import { questsRoute } from './routes';

export function QuestsTile({ tripId }: HubTileProps) {
  const { t } = useLingui();
  const { model } = useQuests(tripId);
  const level = model.level.level;
  const value =
    model.state === 'ready'
      ? model.live > 0
        ? t({ id: 'quests.tile.live', message: `${model.live} live` })
        : t({ id: 'quests.tile.allDone', message: 'All done' })
      : model.state === 'writing'
        ? t({ id: 'quests.tile.writing', message: 'Writing' })
        : model.state === 'over'
          ? t({ id: 'quests.tile.over', message: 'Wrapped' })
          : t({ id: 'quests.tile.dayOne', message: 'Day one' });
  return (
    <HubTile
      tile={{
        key: 'quests',
        title: t({ id: 'quests.tile.title', message: 'Quests' }),
        value,
        caption: t({
          id: 'quests.tile.level',
          message: plural(level, { other: 'crew level #' }),
        }),
        icon: 'star',
        tone: 'orange',
        onPress: () => router.push(questsRoute(tripId)),
      }}
    />
  );
}
