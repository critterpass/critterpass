/**
 * Set rows on the PASS tab (3l-2): the home set as a card with its silhouette strip, and every
 * place as a compact ranked row ("#01 France · 2/5 found" beside its critters). Both open the
 * set's own page (3l-8).
 */
import { upper } from '@cp/i18n';
import { memo } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { CellArt } from './cell-art';
import { homeSetCount, rankNumber, setCount } from './dex-copy';
import type { CritterCell, SetModel } from './dex-model';

const STRIP_ART = 30;
const ROW_ART = 34;

const useStyles = makeStyles((th) => ({
  card: {
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
    padding: th.space['14'],
    gap: th.space['10'],
  },
  row: {
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
    paddingVertical: th.space['10'],
    paddingHorizontal: th.space['14'],
  },
  // Drawn inside the row's own box, so outlining it never moves the list.
  landed: { outlineWidth: th.space['2'], outlineColor: th.semantic.action.primary },
}));

function Art({ cell, size }: { readonly cell: CritterCell; readonly size: number }) {
  return (
    <CellArt
      critterKey={cell.key}
      seed={cell.seed}
      city={cell.city}
      size={size}
      name={cell.name}
      form={cell.form}
      found={cell.found}
      gold={cell.gold}
      glyph={false}
      breathe={false}
      testID={`critters-cell-${cell.no}`}
    />
  );
}

export function HomeSetCard({
  set,
  onOpen,
  landed = false,
}: {
  readonly set: SetModel;
  readonly onOpen: (id: string) => void;
  /** A critter just landed here: the card is outlined for a moment. */
  readonly landed?: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const count = homeSetCount(set.found, set.total);
  return (
    <PressScale
      onPress={() => onOpen(set.id)}
      accessibilityRole="button"
      accessibilityLabel={`${set.name}, ${count}`}
      widthClass="wide"
      style={[styles.card, landed ? styles.landed : null]}
      testID="critters-home-set"
    >
      <Row justify="space-between" align="baseline">
        <Text variant="title">{upper(set.name, locale)}</Text>
        <Text variant="label" color={theme.semantic.text.secondary}>
          {upper(count, locale)}
        </Text>
      </Row>
      <Row justify="space-between">
        {set.cells.map((cell) => (
          <Art key={cell.id} cell={cell} size={STRIP_ART} />
        ))}
      </Row>
    </PressScale>
  );
}

export const PlaceRow = memo(function PlaceRow({
  set,
  onOpen,
  landed = false,
}: {
  readonly set: SetModel;
  readonly onOpen: (id: string) => void;
  /** A critter just landed here: the row is outlined for a moment. */
  readonly landed?: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const count = setCount(set.found, set.total);
  return (
    <PressScale
      onPress={() => onOpen(set.id)}
      accessibilityRole="button"
      accessibilityLabel={`${set.name}, ${count}`}
      widthClass="wide"
      style={[styles.row, landed ? styles.landed : null]}
      testID={`critters-set-${set.rank ?? set.country}`}
    >
      <Row gap="10" align="center">
        <Stack gap="2" flex={1}>
          <Text variant="title" numberOfLines={1}>
            {set.rank === null ? null : (
              <Text variant="title" color={theme.semantic.text.secondary}>
                {`${rankNumber(set.rank)} `}
              </Text>
            )}
            {upper(set.name, locale)}
          </Text>
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {upper(count, locale)}
          </Text>
        </Stack>
        <View style={{ flexDirection: 'row', gap: theme.space['4'] }}>
          {set.cells.slice(0, 5).map((cell) => (
            <Art key={cell.id} cell={cell} size={ROW_ART} />
          ))}
        </View>
      </Row>
    </PressScale>
  );
});
