/**
 * The places a plain-words question found (7d-2): "6 PLACES" with LIST / MAP, each place with what
 * it is, how far, until when it's open and when it fits the trip, a + to add it, and the places
 * that only break a soft chip behind "3 more, louder or further".
 */
import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import type { PlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { makeStyles, Text, useTheme } from '@/ui';
import type { DoodleName } from '@/ui/icons/generated';
import { Segmented } from '@/ui/inputs/Segmented';
import { AddButton, PlaceRow, type FitTone } from '@/ui/planning';
import { PressScale } from '@/ui/press/PressScale';
import { Skeleton } from '@/ui/states/Skeleton';

export interface PlainRow {
  readonly key: string;
  readonly title: string;
  readonly meta: string | undefined;
  readonly icon: DoodleName;
  readonly fitLine: { readonly text: string; readonly tone: FitTone } | undefined;
}

export interface PlainResultsProps {
  readonly rows: readonly PlainRow[];
  /** The places' photos by row key (the POI id), as they arrive. */
  readonly photos?: PlaceTilePhotos | undefined;
  readonly loading: boolean;
  readonly softMisses: number;
  readonly showingSoftMisses: boolean;
  readonly onSoftMisses: () => void;
  readonly onOpen: (key: string) => void;
  readonly onAdd: (key: string) => void;
  /** MAP opens the places map in results mode; absent until that screen is registered. */
  readonly onMap: (() => void) | undefined;
}

const CHEVRON = '›';

const useStyles = makeStyles((th) => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: th.space['12'],
  },
  toggle: { flexShrink: 0 },
  card: { borderRadius: th.radius.lg, backgroundColor: th.semantic.bg.raised, overflow: 'hidden' },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
}));

export function PlainResults(props: PlainResultsProps) {
  const styles = useStyles();
  const theme = useTheme();
  // Every place found, the louder or further ones included ("6 PLACES" over three rows and "3 more").
  const count = props.rows.length + (props.showingSoftMisses ? 0 : props.softMisses);
  if (props.loading && count === 0) return <Skeleton preset="list" repeat={3} />;
  const softMisses = props.softMisses;
  return (
    <View style={{ gap: theme.space['14'] }} testID="search-plain-results">
      <View style={styles.head}>
        <Text variant="h3" testID="search-plain-count">
          {t({
            id: 'search.plain.count',
            message: plural(count, { one: '# place', other: '# places' }),
          })}
        </Text>
        {props.onMap === undefined ? null : (
          <View style={styles.toggle}>
            <Segmented
              segments={[
                { value: 'list', label: t({ id: 'search.plain.list', message: 'List' }) },
                { value: 'map', label: t({ id: 'search.plain.map', message: 'Map' }) },
              ]}
              value="list"
              onChange={(value) => {
                if (value === 'map') props.onMap?.();
              }}
              label={t({ id: 'search.plain.view', message: 'Show as' })}
              selectedTone="cream"
              testID="search-plain-view"
            />
          </View>
        )}
      </View>
      <View style={[styles.card, { opacity: props.loading ? 0.6 : 1 }]}>
        {props.rows.map((row, index) => (
          <PlaceRow
            key={row.key}
            title={row.title}
            meta={row.meta}
            icon={row.icon}
            {...props.photos?.get(row.key)?.tile}
            fitLine={row.fitLine}
            onPress={() => props.onOpen(row.key)}
            trailing={
              <AddButton
                accessibilityLabel={addLabel(row.title)}
                onPress={() => props.onAdd(row.key)}
                testID={`search-plain-add-${String(index)}`}
              />
            }
            testID={`search-plain-row-${String(index)}`}
          />
        ))}
      </View>
      {softMisses === 0 || props.showingSoftMisses ? null : (
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={softLabel(softMisses)}
          onPress={props.onSoftMisses}
          testID="search-plain-soft-misses"
        >
          <View style={styles.more}>
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {softLabel(softMisses)}
            </Text>
            <Text variant="body" color={theme.semantic.text.secondary}>
              {CHEVRON}
            </Text>
          </View>
        </PressScale>
      )}
    </View>
  );
}

function addLabel(name: string): string {
  return t({ id: 'search.row.add', message: `Add ${name}` });
}

function softLabel(count: number): string {
  return t({ id: 'search.plain.softMisses', message: `${count} more, louder or further` });
}
