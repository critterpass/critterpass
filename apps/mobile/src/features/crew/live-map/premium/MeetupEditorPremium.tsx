/**
 * Set or move the meet-up, premium: a page sheet with a place search (snapped to catalogue places
 * near a dragged pin) or the dropped spot, then when (keep the time, or in 15, 30 or 60 minutes).
 * Works offline: the command waits in the queue and the pin shows as pending until it lands.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlaceSearch, type SearchedPlace } from '@/data/places/usePlaceSearch';
import {
  Button,
  Icon,
  PressableScale,
  SegmentedControl,
  Text,
  TextButton,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';

import type { MeetupChoice } from '../panel/meetup-editor';

const WHEN = [15, 30, 60] as const;
const KEEP = 'keep';

export function MeetupEditorPremium(props: {
  readonly mode: 'create' | 'move';
  readonly destinationId: string | null;
  readonly near: { readonly lat: number; readonly lng: number } | null;
  /** A spot the meet-up pin was dragged to. */
  readonly dropped: { readonly lat: number; readonly lng: number } | null;
  readonly currentTime: string | null;
  readonly onConfirm: (choice: MeetupChoice) => void;
  readonly onDismiss: () => void;
}) {
  const { mode, dropped, currentTime } = props;
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<MeetupChoice['place']>(null);
  const [inMinutes, setInMinutes] = useState<number | null>(mode === 'move' ? null : 30);
  const center = dropped ?? props.near;
  const search = usePlaceSearch({
    ...(props.destinationId === null ? {} : { destinationId: props.destinationId }),
    ...(query.trim() === '' ? {} : { q: query.trim() }),
    ...(center === null ? {} : { near: center }),
    limit: 8,
  });
  const droppedName = t({ id: 'liveMap.editor.droppedPin', message: 'Dropped pin' });
  const canConfirm =
    (mode === 'move' && (picked !== null || inMinutes !== null)) || picked !== null;
  const whenOptions = [
    ...(mode === 'move' && currentTime !== null
      ? [
          {
            value: KEEP,
            label: t({ id: 'liveMap.editor.keepTime', message: `Keep ${currentTime}` }),
          },
        ]
      : []),
    ...WHEN.map((minutes) => ({
      value: String(minutes),
      label: t({ id: 'liveMap.editor.inMinutes', message: `In ${minutes} min` }),
    })),
  ];
  const result = (args: {
    readonly key: string;
    readonly title: string;
    readonly sub?: string;
    readonly on: boolean;
    readonly onPress: () => void;
    readonly testID?: string;
  }) => (
    <PressableScale
      key={args.key}
      onPress={args.onPress}
      pressedScale={0.99}
      accessibilityRole="button"
      accessibilityState={{ selected: args.on }}
      {...(args.testID === undefined ? {} : { testID: args.testID })}
    >
      <View style={[styles.result, { borderBottomColor: th.color.hairline }]}>
        <View style={styles.flex}>
          <Text variant="rowTitle" numberOfLines={1}>
            {args.title}
          </Text>
          {args.sub === undefined ? null : (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {args.sub}
            </Text>
          )}
        </View>
        {args.on ? (
          <View style={[styles.check, { backgroundColor: th.accent.mint }]}>
            <Icon name="check" size={12} color={th.color.onAccent} />
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
      onRequestClose={props.onDismiss}
      testID="live-meetup-editor"
    >
      <View
        style={[
          styles.body,
          {
            backgroundColor: th.color.ground,
            padding: th.space.gutter,
            paddingBottom: insets.bottom + 16,
            gap: th.space.gap14,
          },
        ]}
      >
        <View style={styles.head}>
          <Text variant="emptyTitle" style={styles.flex} accessibilityRole="header">
            {mode === 'create'
              ? t({ id: 'liveMap.editor.createTitle', message: 'Set a meet-up' })
              : t({ id: 'liveMap.editor.moveTitle', message: 'Move the meet-up' })}
          </Text>
          <TextButton
            label={t({ id: 'liveMap.premium.cancel', message: 'Cancel' })}
            onPress={props.onDismiss}
            testID="live-meetup-cancel"
          />
        </View>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={t({ id: 'liveMap.editor.search', message: 'Search places' })}
          accessibilityLabel={t({ id: 'liveMap.editor.search', message: 'Search places' })}
          returnKeyType="search"
          testID="live-meetup-search"
        />
        <ScrollView
          style={[styles.list, { borderRadius: th.radius.card, backgroundColor: th.color.card }]}
          keyboardShouldPersistTaps="handled"
        >
          {dropped === null
            ? null
            : result({
                key: 'dropped',
                title: t({ id: 'liveMap.editor.useSpot', message: 'Use this spot' }),
                on: picked?.kind === 'point',
                onPress: () => setPicked({ kind: 'point', ...dropped, name: droppedName }),
              })}
          {search.places.map((place: SearchedPlace) =>
            result({
              key: place.id,
              title: place.name,
              sub: place.categoryLabel,
              on: picked?.kind === 'poi' && picked.poiId === place.id,
              onPress: () => setPicked({ kind: 'poi', poiId: place.id, name: place.name }),
              testID: `live-meetup-place-${place.id}`,
            }),
          )}
        </ScrollView>
        <Text variant="label" tone="muted">
          {t({ id: 'liveMap.editor.when', message: 'When' })}
        </Text>
        <SegmentedControl
          options={whenOptions}
          value={inMinutes === null ? KEEP : String(inMinutes)}
          onChange={(value) => setInMinutes(value === KEEP ? null : Number(value))}
          accessibilityLabel={t({ id: 'liveMap.editor.when', message: 'When' })}
          testID="live-meetup-when"
        />
        <Button
          label={
            mode === 'create'
              ? t({ id: 'liveMap.editor.set', message: 'Set meet-up' })
              : t({ id: 'liveMap.editor.move', message: 'Move it' })
          }
          size="large"
          disabled={!canConfirm}
          onPress={() => props.onConfirm({ place: picked, inMinutes })}
          testID="live-meetup-confirm"
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  list: { flex: 1 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
