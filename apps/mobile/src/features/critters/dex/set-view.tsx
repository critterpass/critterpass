/**
 * One place set (3l-8): the set's name and count, a bar with one segment per critter (lit once
 * found), and every critter as a cell. Locked cells show the city and "???", never the critter;
 * the four corner dots are its forms, lit in their tier colour. Found cells open the critter.
 */
import { upper } from '@cp/i18n';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { TIERS, tierColor } from '@/ui/critters/tier';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { unknownName } from '../critters-copy';
import { CellArt } from './cell-art';
import { gridTileWidth } from './grid';
import { backToDex, homeSetEyebrow, lockedCell, pendingLabel } from './dex-copy';
import type { CritterCell, SetModel } from './dex-model';

const CELL_ART = 64;

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, gap: th.space['14'] },
  segment: { flex: 1, height: th.space['6'], borderRadius: th.space['4'] },
  cell: {
    alignItems: 'center',
    gap: th.space['4'],
    padding: th.space['10'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
  dots: { position: 'absolute', top: th.space['8'], end: th.space['8'], flexDirection: 'row' },
  dot: { width: th.space['6'], height: th.space['6'], borderRadius: th.space['4'] },
}));

function Cell({
  cell,
  width,
  onOpen,
}: {
  readonly cell: CritterCell;
  readonly width: number;
  readonly onOpen: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const name = cell.found ? (cell.name ?? unknownName()) : unknownName();
  const label = cell.found ? `${name}, ${cell.city}` : lockedCell(cell.city);
  return (
    <PressScale
      accessibilityRole={cell.found ? 'button' : 'image'}
      accessibilityLabel={label}
      {...(cell.found ? { onPress: onOpen } : {})}
      style={[styles.cell, width > 0 ? { width } : { opacity: 0 }]}
      testID={`critters-set-cell-${cell.no}`}
    >
      <View style={[styles.dots, { gap: theme.space['2'] }]}>
        {TIERS.map((tier) => (
          <View
            key={tier}
            style={[
              styles.dot,
              {
                backgroundColor: cell.lit.includes(tier)
                  ? tierColor(tier)
                  : theme.semantic.border.decorative,
              },
            ]}
          />
        ))}
      </View>
      <CellArt
        critterKey={cell.key}
        seed={cell.seed}
        city={cell.city}
        size={CELL_ART}
        name={cell.name}
        form={cell.form}
        found={cell.found}
        gold={cell.gold}
      />
      <Text variant="label" numberOfLines={1}>
        {upper(name, locale)}
      </Text>
      <Text variant="eyebrow" color={theme.semantic.text.secondary} numberOfLines={1}>
        {cell.pending ? upper(pendingLabel(), locale) : upper(cell.city, locale)}
      </Text>
    </PressScale>
  );
}

export interface SetViewProps {
  readonly set: SetModel | null;
  readonly onOpenCritter: (critterId: string) => void;
}

export function SetView({ set, onOpenCritter }: SetViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const inset = useTabBarInset();
  // Measured, not a percentage (see grid.ts); the tiles wait for the width in their first frame.
  const [gridWidth, setGridWidth] = useState(0);
  const gridGap = theme.space['10'];
  return (
    <Scaffold variant="dark" edges={['top']} testID="critters-set">
      <ScrollView
        contentContainerStyle={{ paddingTop: theme.space['8'], paddingBottom: inset }}
        style={{ flex: 1 }}
      >
        <View style={styles.body}>
          <BackEyebrow label={upper(backToDex(), locale)} testID="critters-set-back" />
          {set === null ? null : (
            <>
              <Stack gap="2">
                {set.home ? (
                  <Text variant="eyebrow" color={theme.semantic.action.primary}>
                    {upper(homeSetEyebrow(), locale)}
                  </Text>
                ) : null}
                {/* The place at display size takes the row; the count sits smaller beside it. A
                    title that only shrinks to fit has no width of its own in a row, so it is
                    given the room that is left. */}
                <Row justify="space-between" align="flex-end" gap="12">
                  <Text variant="displayXl" style={{ flex: 1 }}>
                    {upper(set.name, locale)}
                  </Text>
                  <Row align="baseline">
                    <Text variant="h2" autoFit={false}>
                      {String(set.found)}
                    </Text>
                    <Text variant="h2" autoFit={false} color={theme.semantic.text.secondary}>
                      {`/${set.total}`}
                    </Text>
                  </Row>
                </Row>
              </Stack>
              <Row
                gap="4"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {set.cells.map((cell) => (
                  <View
                    key={cell.id}
                    style={[
                      styles.segment,
                      {
                        backgroundColor: cell.found
                          ? theme.semantic.action.primary
                          : theme.semantic.bg.raised,
                      },
                    ]}
                  />
                ))}
              </Row>
              <Row
                gap="8"
                wrap
                justify="flex-start"
                style={{ columnGap: gridGap }}
                onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
              >
                {set.cells.map((cell) => (
                  <Cell
                    key={cell.id}
                    cell={cell}
                    width={gridTileWidth(gridWidth, gridGap)}
                    onOpen={() => onOpenCritter(cell.id)}
                  />
                ))}
              </Row>
            </>
          )}
        </View>
      </ScrollView>
    </Scaffold>
  );
}
