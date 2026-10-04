/**
 * FOR YOUR GAPS (7g-1): the plan's next free window ("WED 16:00–19:00 · Four of you are free while
 * the spa runs") with FILL IT, and up to three of the guide's ideas for it as tiles. The window
 * shows first and the ideas when they arrive; with no plan yet or no window left, the card says so.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { PlaceThumb } from '@/ui/planning/place-thumb';
import { PressScale } from '@/ui/press/PressScale';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import * as copy from './copy';

export interface GapTile {
  readonly key: string;
  readonly label: string;
  readonly onPress?: (() => void) | undefined;
}

export type GapsCardState =
  | {
      readonly kind: 'gap';
      /** Already worded: "Wed 16:00–19:00". */
      readonly when: string;
      readonly who: string;
      readonly tiles: readonly GapTile[];
      readonly onFill?: (() => void) | undefined;
    }
  | { readonly kind: 'full' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'loading' };

export interface GapsCardProps {
  readonly guideName: string;
  readonly state: GapsCardState;
}

const TILE_TINTS = ['orange', 'pink', 'blue'] as const;

const useStyles = makeStyles((t) => ({
  card: {
    marginHorizontal: t.size.gutter,
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['14'],
    gap: t.space['12'],
  },
  head: { paddingHorizontal: t.size.gutter },
  when: { flex: 1, minWidth: 0, gap: t.space['2'] },
  tiles: { flexDirection: 'row', gap: t.space['8'] },
  tile: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['8'],
    padding: t.space['4'],
    paddingEnd: t.space['8'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.control,
  },
  tileText: { flex: 1, minWidth: 0 },
}));

function Tile({ tile, index }: { readonly tile: GapTile; readonly index: number }) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n } = useLingui();
  const tint = theme.color[TILE_TINTS[index % TILE_TINTS.length] ?? 'orange'];
  return (
    <PressScale
      style={styles.tileText}
      accessibilityLabel={tile.label}
      disabled={tile.onPress === undefined}
      onPress={tile.onPress}
      widthClass="narrow"
      testID={`explore-trip-gap-idea-${String(index)}`}
    >
      <View style={styles.tile}>
        <PlaceThumb size={28} tint={`${tint}66`} />
        <View style={styles.tileText}>
          <Text variant="label" numberOfLines={1}>
            {upper(tile.label, i18n.locale)}
          </Text>
        </View>
      </View>
    </PressScale>
  );
}

export function GapsCard({ guideName, state }: GapsCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n } = useLingui();
  const locale = i18n.locale;
  return (
    <View style={{ gap: theme.space['10'] }} testID="explore-trip-gaps">
      <Row justify="space-between" align="center" gap="8" style={styles.head}>
        <Text variant="eyebrow">{upper(copy.gapsTitle(), locale)}</Text>
        <Text variant="label" color={theme.semantic.action.primary}>
          {upper(copy.gapsBy(guideName), locale)}
        </Text>
      </Row>
      <View style={styles.card}>
        {state.kind === 'loading' ? (
          <Skeleton preset="lines" label={copy.gapsTitle()} />
        ) : state.kind === 'gap' ? (
          <>
            <Row align="center" gap="12">
              <View style={styles.when}>
                <Text variant="title" numberOfLines={1} testID="explore-trip-gap-when">
                  {upper(state.when, locale)}
                </Text>
                <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={2}>
                  {state.who}
                </Text>
              </View>
              {state.onFill === undefined ? null : (
                <PillButton
                  label={copy.fillIt()}
                  size="sm"
                  block={false}
                  onPress={state.onFill}
                  testID="explore-trip-gap-fill"
                />
              )}
            </Row>
            {state.tiles.length === 0 ? null : (
              <View style={styles.tiles}>
                {state.tiles.map((tile, index) => (
                  <Tile key={tile.key} tile={tile} index={index} />
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={{ gap: theme.space['4'] }} testID={`explore-trip-gaps-${state.kind}`}>
            <Text variant="title">
              {upper(state.kind === 'full' ? copy.gapsFullTitle() : copy.gapsEmptyTitle(), locale)}
            </Text>
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {state.kind === 'full' ? copy.gapsFullLine() : copy.gapsEmptyLine(guideName)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
