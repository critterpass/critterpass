/**
 * Live name results while typing (7d-1, undesigned): the phone's rows first (ideas, then curated),
 * the server's after them, and "More places" from Foursquare when fewer than five come back:
 * display-only (D25), a pick asks for the open-data place behind it.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import type { PlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import type { LivePlace, MorePlacesState } from '@/data/places/more-places';
import type { PlaceCandidate } from '@/data/places/match-places';
import type { SearchState } from '@/data/places/server-name-search';
import { makeStyles, Text, useTheme } from '@/ui';
import { AddButton, PlaceRow } from '@/ui/planning';
import { Skeleton } from '@/ui/states/Skeleton';

import { placeIcon } from './place-icons';

const useStyles = makeStyles((th) => ({
  card: { borderRadius: th.radius.lg, backgroundColor: th.semantic.bg.raised, overflow: 'hidden' },
  section: { gap: th.space['8'] },
}));

export interface NameResultsProps {
  readonly rows: readonly PlaceCandidate[];
  readonly state: SearchState;
  readonly live: MorePlacesState;
  /** The places' photos by POI id, as they arrive. */
  readonly photos?: PlaceTilePhotos | undefined;
  readonly onOpen: (place: PlaceCandidate) => void;
  readonly onAdd: (place: PlaceCandidate) => void;
  readonly onPickLive: (place: LivePlace) => void;
}

function addLabel(place: PlaceCandidate): string {
  const name = place.name;
  return t({ id: 'search.row.add', message: `Add ${name}` });
}

function sourceLine(place: PlaceCandidate): string | undefined {
  if (place.source === 'idea') return t({ id: 'search.row.saved', message: 'In your Ideas' });
  return undefined;
}

export function NameResults({
  rows,
  state,
  live,
  photos,
  onOpen,
  onAdd,
  onPickLive,
}: NameResultsProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space['14'] }} testID="search-name-results">
      {rows.length === 0 && state === 'searching' ? <Skeleton preset="list" repeat={2} /> : null}
      {rows.length === 0 ? null : (
        <View style={styles.card}>
          {rows.map((place, index) => (
            <PlaceRow
              key={place.poiId ?? place.id}
              title={place.name}
              meta={sourceLine(place) ?? place.nameLocal ?? undefined}
              icon={placeIcon(place.category)}
              {...(place.poiId === null ? undefined : photos?.get(place.poiId))}
              onPress={() => onOpen(place)}
              trailing={
                place.poiId === null ? undefined : (
                  <AddButton
                    accessibilityLabel={addLabel(place)}
                    onPress={() => onAdd(place)}
                    testID={`search-row-add-${String(index)}`}
                  />
                )
              }
              testID={`search-row-${String(index)}`}
            />
          ))}
        </View>
      )}
      {live.kind === 'done' && live.places.length > 0 ? (
        <View style={styles.section} testID="search-more-places">
          <Text variant="eyebrow">{t({ id: 'search.more.eyebrow', message: 'More places' })}</Text>
          <View style={styles.card}>
            {live.places.map((place) => (
              <PlaceRow
                key={place.fsqPlaceId}
                title={place.name}
                meta={place.address ?? undefined}
                icon="pin"
                onPress={() => onPickLive(place)}
              />
            ))}
          </View>
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {t({ id: 'search.more.attribution', message: 'Powered by Foursquare' })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
