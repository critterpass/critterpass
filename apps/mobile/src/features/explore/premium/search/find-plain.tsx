/**
 * Plain words (4.31): "Tokek read it as" with the parse's chips (× takes one off and reruns without
 * raising the keyboard), the guide's note on what the plan left out, "6 places" with List · Map,
 * the places with their fit lines and `+`, and "3 more, louder or further". When nothing matches
 * every chip the closest places show under what was left out; nothing at all opens the ways out
 * (4.33); a search that failed says so with a retry.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test ids, never copy. */
import type { SearchChip } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  enterTransition,
  exitTransition,
  GuideNote,
  Icon,
  layoutTransition,
  ListCard,
  SegmentedControl,
  Skeleton,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import type { PlaceTilePhotos } from '@/data/media/use-place-tile-photos';

import { chipLabel, type ChipWords } from '../../search/chip-words';
import { closeLine, droppedWords } from '../../search/no-results-words';
import { chipKey } from '../../search/plain-filters';
import type { PlainRow } from '../../search/use-plain-section';
import { PlaceResultRow } from '../components/place-result-row';

const CHIP_HEIGHT = 30;
const CHIP_CROSS = 18;

export function ChipRow(props: {
  readonly chips: readonly SearchChip[];
  readonly words: ChipWords;
  readonly guideName: string;
  readonly onRemove: (key: string) => void;
}) {
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  if (props.chips.length === 0) return null;
  return (
    <View style={{ gap: theme.space.gap8 }} testID="search-chips">
      <Text variant="label" tone="muted">
        {t({ id: 'search.premium.chips.eyebrow', message: `${props.guideName} read it as` })}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap6 }}>
        {props.chips.map((chip) => {
          const key = chipKey(chip);
          const label = chipLabel(chip, props.words);
          return (
            <Animated.View
              key={key}
              entering={enterTransition(reduced)}
              exiting={exitTransition(reduced)}
              layout={layoutTransition(reduced)}
              testID={`chip-${key}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.gap6,
                height: CHIP_HEIGHT,
                paddingStart: theme.space.gap12,
                paddingEnd: theme.space.gap6,
                borderRadius: CHIP_HEIGHT / 2,
                backgroundColor: theme.color.ink,
              }}
            >
              <Text variant="noteAction" tone="onInk" numberOfLines={1}>
                {label}
              </Text>
              <Pressable
                onPress={() => props.onRemove(key)}
                accessibilityRole="button"
                accessibilityLabel={t({ id: 'search.chip.remove', message: `Remove ${label}` })}
                hitSlop={theme.space.gap12}
                testID={`chip-${key}-remove`}
                style={{
                  width: CHIP_CROSS,
                  height: CHIP_CROSS,
                  borderRadius: CHIP_CROSS / 2,
                  backgroundColor: theme.color.inkToastAction,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="close" size={CHIP_CROSS - 6} color={theme.color.onInk} />
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

export function PlainNote(props: {
  readonly note: string | null;
  readonly guideName: string;
  readonly critter: string;
}) {
  if (props.note === null) return null;
  return (
    <GuideNote name={props.guideName} critter={props.critter} text={props.note} showName={false} />
  );
}

export interface PlainListProps {
  readonly rows: readonly PlainRow[];
  readonly photos?: PlaceTilePhotos | undefined;
  readonly loading: boolean;
  /** "Close to that" over places that match most of what was asked, in place of the count. */
  readonly heading?: string | undefined;
  readonly softMisses: number;
  readonly showingSoftMisses: boolean;
  readonly onSoftMisses: () => void;
  readonly onOpen: (key: string) => void;
  readonly onAdd: (key: string, title: string) => void;
  readonly onMap: (() => void) | undefined;
}

export function PlainList(props: PlainListProps) {
  const theme = usePremiumTheme();
  const count = props.rows.length + (props.showingSoftMisses ? 0 : props.softMisses);
  if (props.loading && count === 0) {
    return (
      <View style={{ gap: theme.space.gap10 }} testID="search-plain-loading">
        <Skeleton height={theme.size.button} radius={theme.radius.card} tone="block" />
        <Skeleton height={theme.size.button} radius={theme.radius.card} tone="block" />
      </View>
    );
  }
  const soft = props.softMisses;
  return (
    <View style={{ gap: theme.space.gap12 }} testID="search-plain-results">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.space.gap12,
          paddingHorizontal: theme.space.gap8,
        }}
      >
        <Text variant="headline" testID="search-plain-count" style={{ flexShrink: 1 }}>
          {props.heading ??
            t({
              id: 'search.plain.count',
              message: plural(count, { one: '# place', other: '# places' }),
            })}
        </Text>
        {props.onMap === undefined ? null : (
          <SegmentedControl
            options={[
              { value: 'list', label: t({ id: 'search.plain.list', message: 'List' }) },
              { value: 'map', label: t({ id: 'search.plain.map', message: 'Map' }) },
            ]}
            value="list"
            onChange={(value) => {
              if (value === 'map') props.onMap?.();
            }}
            accessibilityLabel={t({ id: 'search.plain.view', message: 'Show as' })}
            testID="search-plain-view"
          />
        )}
      </View>
      <ListCard style={{ opacity: props.loading ? theme.opacity.earlier : 1 }}>
        {props.rows.map((row, index) => (
          <PlaceResultRow
            key={row.key}
            title={row.title}
            meta={row.meta}
            icon={row.icon}
            photo={props.photos?.get(row.key)?.tile.photo}
            fitLine={row.fitLine}
            onPress={() => props.onOpen(row.key)}
            {...(row.inPlan === true
              ? {}
              : {
                  onAdd: () => props.onAdd(row.key, row.title),
                  addLabel: t({ id: 'search.premium.row.add', message: `Add ${row.title}` }),
                  addTestID: `search-plain-add-${String(index)}`,
                })}
            testID={
              row.inPlan === true
                ? `search-plain-in-plan-${String(index)}`
                : `search-plain-row-${String(index)}`
            }
          />
        ))}
      </ListCard>
      {soft === 0 || props.showingSoftMisses ? null : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: theme.space.gap8,
          }}
        >
          <Text variant="rowText" tone="muted">
            {t({
              id: 'search.premium.plain.softMisses',
              message: `${soft} more, louder or further`,
            })}
          </Text>
          <TextButton
            label={t({ id: 'explore.premium.find.show', message: 'Show ›' })}
            tone="ink"
            onPress={props.onSoftMisses}
            testID="search-plain-soft-misses"
          />
        </View>
      )}
    </View>
  );
}

export function ClosePlacesList(
  props: Omit<PlainListProps, 'loading' | 'softMisses' | 'showingSoftMisses' | 'onSoftMisses'> & {
    readonly dropped: readonly string[];
    readonly chips: readonly SearchChip[];
    readonly words: ChipWords;
  },
) {
  const theme = usePremiumTheme();
  return (
    <View style={{ gap: theme.space.gap10 }} testID="search-close-results">
      <Text
        variant="body"
        tone="muted"
        style={{ paddingHorizontal: theme.space.gap8 }}
        testID="search-close-line"
      >
        {closeLine(droppedWords(props.dropped, props.chips, props.words))}
      </Text>
      <PlainList
        {...props}
        loading={false}
        heading={t({ id: 'search.close.heading', message: 'Close to that' })}
        softMisses={0}
        showingSoftMisses
        onSoftMisses={() => undefined}
      />
    </View>
  );
}
