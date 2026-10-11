/**
 * Find with no signal (4.57): "Offline results · 3" over where they come from, the phone's places
 * for what was typed with walking minutes and "open, as of" the last sync, the question the guide
 * keeps for the first bar (a dashed queued card), and what works offline.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import type { TripPlaceSearch } from '@/data/places/use-trip-place-search';
import { Icon, ListCard, StatusTag, Text, usePremiumTheme } from '@/ui/premium';

import type { LatLng } from '../../search/offline-model';
import { placeIcon } from '../../search/place-icons';
import { useOfflineRows } from '../../search/use-offline-rows';
import type { SearchTrip } from '../../search/use-search-trip';
import { Eyebrow, SectionLabel } from '../components/labels';
import { PlaceResultRow } from '../components/place-result-row';

export interface FindOfflineProps {
  readonly search: TripPlaceSearch;
  readonly trip: SearchTrip;
  /** Where the search was opened from, when there is no position. */
  readonly from: LatLng | null;
  readonly queued: number;
  readonly onOpen: (key: string) => void;
}

export function FindOffline({ search, trip, from, queued, onOpen }: FindOfflineProps) {
  const theme = usePremiumTheme();
  const { rows, photos, syncedOn } = useOfflineRows(search, trip, from);
  const count = rows.length;
  const saved = search.counts.saved;
  const curated = search.counts.curated;
  const guideName = trip.guideName;
  const destination = trip.destination;
  const date = syncedOn;
  return (
    <View style={{ gap: theme.space.gap16 }} testID="search-offline">
      <View style={{ gap: theme.space.gap4, paddingHorizontal: theme.space.gap8 }}>
        <Eyebrow text={t({ id: 'search.offline.count', message: `Offline results · ${count}` })} />
        <Text variant="caption" tone="placeholder">
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
      </View>
      {rows.length === 0 ? null : (
        <ListCard>
          {rows.map((row, index) => (
            <PlaceResultRow
              key={row.key}
              title={row.title}
              meta={row.meta}
              icon={placeIcon(row.category)}
              photo={photos.get(row.key)?.tile.photo}
              thumbSize={44}
              onPress={() => onOpen(row.key)}
              trailing={
                row.saved ? (
                  <StatusTag
                    tone="unopened"
                    label={t({ id: 'search.offline.saved', message: 'Saved' })}
                  />
                ) : undefined
              }
              testID={`search-offline-row-${String(index)}`}
            />
          ))}
        </ListCard>
      )}
      {queued === 0 ? null : (
        <View
          testID="search-queued-card"
          style={{
            borderRadius: theme.radius.banner,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: theme.color.outlineEmpty,
            backgroundColor: theme.color.card,
            opacity: 0.85,
            paddingVertical: theme.space.gap12,
            paddingHorizontal: theme.space.rowPadH,
            gap: theme.space.gap4,
          }}
        >
          <Eyebrow
            text={t({ id: 'search.offline.queued', message: `Queued · ${queued}` })}
            color={theme.color.status.tangerine.text}
          />
          <Text variant="caption" tone="muted">
            {t({
              id: 'search.offline.queuedLine',
              message: `Plain words need signal. ${guideName} kept your question and answers at the first bar.`,
            })}
          </Text>
        </View>
      )}
      <View style={{ gap: theme.space.gap8 }}>
        <SectionLabel>{t({ id: 'search.offline.works', message: 'Works offline' })}</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap6 }}>
          {[
            t({ id: 'search.offline.works.plan', message: 'The plan' }),
            t({ id: 'search.offline.works.bookings', message: 'Bookings' }),
            t({ id: 'search.offline.works.places', message: `${curated} places` }),
          ].map((label) => (
            <View
              key={label}
              style={{
                height: 30,
                borderRadius: 15,
                paddingHorizontal: theme.space.gap12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.gap4,
                backgroundColor: theme.color.status.booked.bg,
              }}
            >
              <Icon name="check" size={14} color={theme.color.status.booked.text} />
              <Text variant="badge" color={theme.color.status.booked.text}>
                {label}
              </Text>
            </View>
          ))}
        </View>
        <Text variant="caption" tone="muted">
          {t({ id: 'search.offline.works.waits', message: `${guideName}’s changes wait` })}
        </Text>
      </View>
    </View>
  );
}
