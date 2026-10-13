/**
 * A destination's places as a premium list, for the places list's routes: a pushed page with the
 * glass back and the way to the map, the search pill, the filter chips (or what a search found),
 * then the crew's saved places, the plan's and the guide's suggestions, each row the results-card
 * row (thumb, name, kind, fit line, `+`). A suggestion has a heart that saves it; places hidden
 * from the list can be shown again. Drawn from the places list's own values.
 */

import { useLingui } from '@lingui/react/macro';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';

import { screenCredits } from '@/data/media/use-place-tile-photos';
import {
  Button,
  EmptyState,
  GlassSurface,
  GuideNote,
  Icon,
  IconButton,
  ListCard,
  LoadingCritter,
  PressableScale,
  Tag,
  Text,
  TextButton,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import {
  planGroupTitle,
  rowMeta,
  savedGroupTitle,
  suggestsGroupTitle,
} from '../../places/places-copy';
import type { PlacesListViewProps } from '../../places/places-list-view';
import type { HubPlace } from '../../places/places-model';
import { placeGroups } from '../../places/place-groups';
import { placeIcon } from '../../search/place-icons';
import { SectionLabel } from '../components/labels';
import { PlaceResultRow } from '../components/place-result-row';
import { PlacesChips } from './places-chips';
import { placesWords } from './places-words';

export function PremiumPlacesListView(props: PlacesListViewProps) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const { places, filter, fits, lines, photos } = props;
  const status = props.status ?? 'ready';
  const from = props.stay?.at ?? props.viewer ?? null;
  const suggestOrder = props.suggestTotal === null ? null : props.suggestOrder;
  const groups = useMemo(
    () => placeGroups({ places, filter, sort: 'fit', fits, suggestOrder, from }),
    [places, filter, fits, suggestOrder, from],
  );
  const shownIds = [...groups.saved, ...groups.plan, ...groups.suggests]
    .slice(0, 30)
    .flatMap((place) => (place.poiId === null ? [] : [place.poiId]))
    .join(',');
  const { onInView } = props;
  useEffect(() => {
    if (shownIds !== '') onInView?.(shownIds.split(','));
  }, [shownIds, onInView]);
  const credits = photos === undefined ? [] : screenCredits(photos.values());

  const row = (place: HubPlace, index: number, group: string) => {
    const sponsored = props.sponsored?.poiId === place.poiId && place.standing === 'suggested';
    const fit = place.poiId === null ? undefined : lines.get(place.poiId);
    const poiId = place.poiId;
    return (
      <View key={place.id}>
        <PlaceResultRow
          title={place.name}
          meta={rowMeta(place.category, null)}
          icon={placeIcon(place.category)}
          photo={poiId === null ? undefined : photos?.get(poiId)?.tile.photo}
          fitLine={fit}
          onPress={() => props.onOpen(place, sponsored)}
          {...(props.onAdd === undefined || poiId === null || place.standing === 'plan'
            ? {}
            : {
                onAdd: () => props.onAdd?.(poiId),
                addLabel: t({ id: 'search.premium.row.add', message: `Add ${place.name}` }),
              })}
          trailing={
            sponsored ? (
              <Tag label={t({ id: 'explore.premium.places.sponsored', message: 'Sponsored' })} />
            ) : place.standing === 'suggested' && props.onAction !== undefined ? (
              <IconButton
                icon="heart"
                size={34}
                tone="control"
                label={t({ id: 'explore.premium.places.save', message: `Save ${place.name}` })}
                onPress={() => props.onAction?.(place, 'save')}
                testID={`places-${group}-${String(index)}-save`}
              />
            ) : undefined
          }
          testID={`places-${group}-${String(index)}`}
        />
        {sponsored && props.sponsored !== null ? (
          <View style={{ paddingHorizontal: theme.space.gap12, paddingBottom: theme.space.gap8 }}>
            <TextButton
              label={t({ id: 'explore.sponsored.why', message: 'Why am I seeing this?' })}
              onPress={props.sponsored.onWhy}
              tone="muted"
              testID="places-sponsored-why"
            />
          </View>
        ) : null}
      </View>
    );
  };

  const section = (title: string, list: readonly HubPlace[], group: string) =>
    list.length === 0 ? null : (
      <View key={group} style={{ gap: theme.space.gap8 }}>
        <SectionLabel>{title}</SectionLabel>
        <ListCard>{list.map((place, index) => row(place, index, group))}</ListCard>
      </View>
    );

  const empty = groups.saved.length + groups.plan.length + groups.suggests.length === 0;
  const loadMore =
    (props.suggestTotal ?? 0) > groups.suggests.length ? props.onLoadMore : undefined;

  return (
    <PushScreen
      title={props.destinationName}
      backLabel={placesWords.back()}
      action={{
        key: 'map',
        label: placesWords.map(),
        sfSymbol: 'map',
        glyph: 'pin',
        text: true,
        onPress: props.onMap,
      }}
      testID="places-list-page"
    >
      <View style={{ gap: theme.space.gap16, paddingTop: theme.space.gap8 }}>
        {props.onQuery === undefined ? (
          <PressableScale
            onPress={props.onSearch}
            accessibilityRole="search"
            accessibilityLabel={placesWords.search(props.destinationName, props.guide.name)}
            testID="places-list-search"
            style={{ marginHorizontal: theme.space.gap16 }}
          >
            <GlassSurface
              kind="nav"
              interactive
              style={{
                height: 44,
                borderRadius: 22,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: theme.space.gap16,
                gap: theme.space.gap8,
              }}
            >
              <Icon name="search" size={17} color={theme.color.muted} />
              <Text variant="body" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                {placesWords.search(props.destinationName, props.guide.name)}
              </Text>
            </GlassSurface>
          </PressableScale>
        ) : (
          <View style={{ marginHorizontal: theme.space.gap16 }}>
            <TextField
              value={props.query ?? ''}
              onChangeText={props.onQuery}
              placeholder={placesWords.findHere(props.destinationName)}
              accessibilityLabel={placesWords.findHere(props.destinationName)}
              returnKeyType="search"
              testID="places-list-field"
            />
          </View>
        )}
        {props.resultChips === undefined ? (
          <PlacesChips places={places} filter={filter} onFilter={props.onFilter} over="list" />
        ) : (
          <View style={{ paddingHorizontal: theme.space.gap16 }}>
            <GuideNote
              name={props.guide.name}
              text={placesWords.results(props.resultChips)}
              showName={false}
              action={{ label: placesWords.showAll(), onPress: props.onLeaveResults }}
              testID="places-list-results"
            />
          </View>
        )}
        <View style={{ gap: theme.space.gap16, paddingHorizontal: theme.space.gap16 }}>
          {status === 'loading' ? (
            <LoadingCritter label={placesWords.loading()} testID="places-list-loading" />
          ) : status === 'failed' ? (
            <EmptyState
              title={placesWords.failedTitle()}
              line={placesWords.failedLine()}
              critter={{ kind: props.guide.kind, name: props.guide.name }}
              {...(props.onRetry === undefined
                ? {}
                : {
                    action: (
                      <Button
                        label={placesWords.retry()}
                        variant="secondary"
                        onPress={props.onRetry}
                      />
                    ),
                  })}
              testID="places-list-failed"
            />
          ) : empty ? (
            <EmptyState
              title={placesWords.emptyTitle()}
              line={placesWords.emptyLine()}
              critter={{ kind: props.guide.kind, name: props.guide.name }}
              testID="places-list-empty"
            />
          ) : (
            <>
              {section(savedGroupTitle(groups.saved.length), groups.saved, 'saved')}
              {section(planGroupTitle(groups.plan.length), groups.plan, 'plan')}
              {section(
                suggestsGroupTitle(props.guide.name, props.suggestTotal ?? groups.suggests.length),
                groups.suggests,
                'suggests',
              )}
              {loadMore === undefined ? null : (
                <TextButton
                  label={t({ id: 'explore.premium.places.more', message: 'Show more' })}
                  onPress={loadMore}
                  align="center"
                  testID="places-list-more"
                />
              )}
            </>
          )}
          {props.hidden.length === 0 ? null : (
            <View style={{ gap: theme.space.gap8 }}>
              <SectionLabel>{placesWords.hidden(props.hidden.length)}</SectionLabel>
              <ListCard>
                {props.hidden.map((entry) => (
                  <PlaceResultRow
                    key={entry.poiId}
                    title={entry.name}
                    icon="pin"
                    trailing={
                      <TextButton
                        label={placesWords.showAgain()}
                        onPress={() => props.onUnhide(entry.poiId)}
                        testID={`places-unhide-${entry.poiId}`}
                      />
                    }
                  />
                ))}
              </ListCard>
            </View>
          )}
          {credits.length === 0 ? null : (
            <Text variant="captionMuted" tone="muted">
              {credits.join(' · ')}
            </Text>
          )}
        </View>
      </View>
    </PushScreen>
  );
}
