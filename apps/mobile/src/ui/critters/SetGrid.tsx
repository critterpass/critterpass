import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { lockedStickerLabel } from '../sticker/a11y';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import type { Tier } from './tier';
import { TIERS, tierColor } from './tier';

export interface SetSlot {
  readonly id: string;
  /** Critter name once found. */
  readonly name?: string;
  /** City the slot belongs to; shown even while locked. */
  readonly city: string;
  /** Sticker when found, silhouette slot when locked. */
  readonly sticker: ReactNode;
  /** Forms found so far; lights the corner dots. */
  readonly formsFound?: readonly Tier[];
}

export interface SetGridProps {
  /** "Vietnam", "#01 France". */
  readonly title: string;
  /** "3/10 · Home set". */
  readonly countLabel?: string;
  readonly slots: readonly SetSlot[];
  /** `row` = silhouette strip on the pass; `grid` = full set cells with city and form dots. */
  readonly variant?: 'row' | 'grid';
  readonly onOpen?: (id: string) => void;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    gap: th.space['10'],
  },
  cell: {
    width: '31%',
    alignItems: 'center',
    gap: th.space['4'],
    padding: th.space['10'],
    borderRadius: th.radius.md,
    backgroundColor: th.semantic.bg.base,
  },
  dot: {
    position: 'absolute',
    width: th.space['6'],
    height: th.space['6'],
    borderRadius: th.space['4'],
  },
}));

const DOT_POSITION = [
  { top: 6, start: 6 },
  { top: 6, end: 6 },
  { bottom: 6, start: 6 },
  { bottom: 6, end: 6 },
] as const;

function slotLabel(slot: SetSlot): string {
  if (!slot.name) return lockedStickerLabel(slot.city);
  const { name, city } = slot;
  const forms = slot.formsFound?.length ?? 0;
  return t({ id: 'common.critter.slotFound', message: `${name}, ${city}, ${forms} of 4 forms` });
}

/** A place set: silhouettes until found; locked cells show the city, never the critter. */
export function SetGrid({
  title,
  countLabel,
  slots,
  variant = 'grid',
  onOpen,
  testID,
}: SetGridProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack style={styles.card} testID={testID}>
      <Row justify="space-between" align="baseline" accessible accessibilityRole="header">
        <Text variant="title">{title}</Text>
        {countLabel ? (
          <Text variant="label" color={theme.semantic.text.secondary}>
            {countLabel}
          </Text>
        ) : null}
      </Row>
      {variant === 'row' ? (
        <Row gap="4" wrap>
          {slots.map((slot) => (
            <View
              key={slot.id}
              accessible
              accessibilityRole="image"
              accessibilityLabel={slotLabel(slot)}
            >
              {slot.sticker}
            </View>
          ))}
        </Row>
      ) : (
        <Row gap="8" wrap justify="space-between">
          {slots.map((slot) => (
            <PressScale
              key={slot.id}
              accessibilityRole={onOpen && slot.name ? 'button' : 'image'}
              accessibilityLabel={slotLabel(slot)}
              {...(onOpen && slot.name ? { onPress: () => onOpen(slot.id) } : {})}
              style={styles.cell}
            >
              {TIERS.map((tier, index) => (
                <View
                  key={tier}
                  style={[
                    styles.dot,
                    DOT_POSITION[index],
                    {
                      backgroundColor: slot.formsFound?.includes(tier)
                        ? tierColor(tier)
                        : theme.semantic.border.decorative,
                    },
                  ]}
                />
              ))}
              {slot.sticker}
              <Text variant="label" numberOfLines={1}>
                {slot.name ?? '???'}
              </Text>
              <Text variant="caption" color={theme.semantic.text.secondary} numberOfLines={1}>
                {slot.city}
              </Text>
            </PressScale>
          ))}
        </Row>
      )}
    </Stack>
  );
}
