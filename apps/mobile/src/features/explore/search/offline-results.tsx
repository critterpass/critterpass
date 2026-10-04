/**
 * Search with no signal (7i-2): "OFFLINE RESULTS · 3" with the area, a line on what was searched
 * ("From your 14 saved places and the 306 Tokek saved for Bali on Oct 11."), the places with
 * walking minutes and what the phone knows, SAVED on the crew's ideas, and the queued question.
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import type { PlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { makeStyles, Text, useTheme } from '@/ui';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { PlaceRow, PlanningTag } from '@/ui/planning';
import { Sticker } from '@/ui/sticker/Sticker';

import { placeIcon } from './place-icons';

export interface OfflineRow {
  readonly key: string;
  readonly title: string;
  readonly category: string | null;
  /** "4 min walk · open, as of Oct 11". */
  readonly meta: string | undefined;
  readonly saved: boolean;
}

export interface OfflineResultsProps {
  readonly rows: readonly OfflineRow[];
  /** Photos this session already has, by row key; without one the row keeps its category tile. */
  readonly photos?: PlaceTilePhotos | undefined;
  readonly area: string;
  readonly saved: number;
  readonly curated: number;
  readonly destination: string;
  /** "Oct 11": when the trip's places last synced. */
  readonly syncedOn: string | null;
  readonly guide: GuideId;
  readonly guideName: string;
  /** Plain-words questions waiting for signal. */
  readonly queued: number;
  readonly onOpen: (key: string) => void;
}

const useStyles = makeStyles((th) => ({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { borderRadius: th.radius.lg, backgroundColor: th.semantic.bg.raised, overflow: 'hidden' },
  queued: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
  },
}));

export function OfflineResults(props: OfflineResultsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const count = props.rows.length;
  const saved = props.saved;
  const curated = props.curated;
  const guideName = props.guideName;
  const destination = props.destination;
  const date = props.syncedOn;
  const queued = props.queued;
  const sticker = GUIDE_STICKERS[props.guide];
  return (
    <View style={{ gap: theme.space['12'] }} testID="search-offline-results">
      <View style={styles.head}>
        <Text variant="eyebrow">
          {t({ id: 'search.offline.count', message: `Offline results · ${count}` })}
        </Text>
        <Text variant="eyebrow" color={theme.semantic.text.secondary}>
          {props.area}
        </Text>
      </View>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {date === null
          ? t({
              id: 'search.offline.fromNoDate',
              message: `From your ${saved} saved places and the ${curated} ${guideName} saved for ${destination}.`,
            })
          : t({
              id: 'search.offline.from',
              message: `From your ${saved} saved places and the ${curated} ${guideName} saved for ${destination} on ${date}.`,
            })}
      </Text>
      {count === 0 ? null : (
        <View style={styles.card}>
          {props.rows.map((row, index) => (
            <PlaceRow
              key={row.key}
              title={row.title}
              meta={row.meta}
              icon={placeIcon(row.category)}
              {...props.photos?.get(row.key)?.tile}
              onPress={() => props.onOpen(row.key)}
              trailing={
                row.saved ? (
                  <PlanningTag
                    label={t({ id: 'search.offline.saved', message: 'Saved' })}
                    color={tokens.color.ink['700']}
                  />
                ) : undefined
              }
              testID={`search-offline-row-${String(index)}`}
            />
          ))}
        </View>
      )}
      {queued === 0 ? null : (
        <View style={styles.queued} testID="search-queued-card">
          <View style={{ opacity: 0.5 }}>
            <Sticker kind={sticker.kind} name={sticker.name} pose="sleep" size={40} />
          </View>
          <Text variant="bodySm" style={{ flex: 1 }}>
            {t({
              id: 'search.offline.queuedLine',
              message: `Plain words need signal. ${guideName} kept your question and answers at the first bar.`,
            })}
          </Text>
          <PlanningTag
            label={t({ id: 'search.offline.queued', message: `Queued · ${queued}` })}
            color={tokens.color.yellow}
          />
        </View>
      )}
    </View>
  );
}
