/**
 * Set or move the meet-up: search the destination's places (snapped to catalogue places near a
 * dragged pin), or keep the dropped spot, then pick when. Works offline: the command waits in the
 * queue and the pin shows as pending until it lands.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { usePlaceSearch, type SearchedPlace } from '@/data/places/usePlaceSearch';
import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { SearchField } from '@/ui/inputs/SearchField';
import { Sheet } from '@/ui/sheet/Sheet';
import { Row, Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

export interface MeetupChoice {
  readonly place:
    | { readonly kind: 'poi'; readonly poiId: string; readonly name: string }
    | { readonly kind: 'point'; readonly lat: number; readonly lng: number; readonly name: string }
    | null;
  /** Minutes from now; null keeps the current time (a move only). */
  readonly inMinutes: number | null;
}

const WHEN = [15, 30, 60] as const;

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['16'] },
  result: {
    paddingVertical: th.space['12'],
    borderBottomWidth: 1,
    borderBottomColor: th.color.divider,
  },
  list: { maxHeight: 260 },
}));

export function MeetupEditor({
  mode,
  destinationId,
  near,
  dropped,
  currentTime,
  onConfirm,
  onDismiss,
}: {
  readonly mode: 'create' | 'move';
  readonly destinationId: string | null;
  readonly near: { readonly lat: number; readonly lng: number } | null;
  /** A spot the meet-up pin was dragged to. */
  readonly dropped: { readonly lat: number; readonly lng: number } | null;
  readonly currentTime: string | null;
  readonly onConfirm: (choice: MeetupChoice) => void;
  readonly onDismiss: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<MeetupChoice['place']>(null);
  const [inMinutes, setInMinutes] = useState<number | null>(mode === 'move' ? null : 30);
  const center = dropped ?? near;
  const search = usePlaceSearch({
    ...(destinationId === null ? {} : { destinationId }),
    ...(query.trim() === '' ? {} : { q: query.trim() }),
    ...(center === null ? {} : { near: center }),
    limit: 8,
  });
  const droppedName = t({ id: 'liveMap.editor.droppedPin', message: 'Dropped pin' });
  const pick = (place: SearchedPlace) =>
    setPicked({ kind: 'poi', poiId: place.id, name: place.name });
  const canConfirm =
    (mode === 'move' && (picked !== null || inMinutes !== null)) || picked !== null;

  return (
    <Sheet
      onDismiss={onDismiss}
      detents={['large']}
      accessibilityLabel={t({ id: 'liveMap.editor.title', message: 'Meet-up' })}
      testID="live-meetup-editor"
    >
      <View style={styles.body}>
        <Text variant="h2" accessibilityRole="header">
          {mode === 'create'
            ? t({ id: 'liveMap.editor.createTitle', message: 'Set a meet-up' })
            : t({ id: 'liveMap.editor.moveTitle', message: 'Move the meet-up' })}
        </Text>
        <SearchField
          value={query}
          onChangeText={setQuery}
          label={t({ id: 'liveMap.editor.search', message: 'Search places' })}
          testID="live-meetup-search"
        />
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {dropped === null ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: picked?.kind === 'point' }}
              onPress={() => setPicked({ kind: 'point', ...dropped, name: droppedName })}
              style={styles.result}
            >
              <Text variant="rowTitle">
                {t({ id: 'liveMap.editor.useSpot', message: 'Use this spot' })}
              </Text>
            </Pressable>
          )}
          {search.places.map((place) => (
            <Pressable
              key={place.id}
              accessibilityRole="button"
              accessibilityState={{ selected: picked?.kind === 'poi' && picked.poiId === place.id }}
              onPress={() => pick(place)}
              style={styles.result}
              testID={`live-meetup-place-${place.id}`}
            >
              <Stack gap="2">
                <Text variant="rowTitle" numberOfLines={1}>
                  {place.name}
                </Text>
                <Text variant="caption" color={theme.semantic.text.secondary}>
                  {place.categoryLabel}
                </Text>
              </Stack>
            </Pressable>
          ))}
        </ScrollView>
        <Stack gap="8">
          <Text variant="eyebrow" color={theme.semantic.text.secondary}>
            {t({ id: 'liveMap.editor.when', message: 'When' })}
          </Text>
          <Row style={{ gap: theme.space['8'], flexWrap: 'wrap' }}>
            {mode === 'move' && currentTime !== null ? (
              <ChoiceChip
                label={t({ id: 'liveMap.editor.keepTime', message: `Keep ${currentTime}` })}
                selected={inMinutes === null}
                onPress={() => setInMinutes(null)}
              />
            ) : null}
            {WHEN.map((minutes) => (
              <ChoiceChip
                key={minutes}
                label={t({ id: 'liveMap.editor.inMinutes', message: `In ${minutes} min` })}
                selected={inMinutes === minutes}
                onPress={() => setInMinutes(minutes)}
              />
            ))}
          </Row>
        </Stack>
        <PillButton
          label={
            mode === 'create'
              ? t({ id: 'liveMap.editor.set', message: 'Set meet-up' })
              : t({ id: 'liveMap.editor.move', message: 'Move it' })
          }
          disabled={!canConfirm}
          onPress={() => onConfirm({ place: picked, inMinutes })}
          block
          testID="live-meetup-confirm"
        />
      </View>
    </Sheet>
  );
}
