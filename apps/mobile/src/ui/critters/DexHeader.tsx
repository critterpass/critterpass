import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Tag } from '../plan/ActionPill';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface DexFilterOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

export interface DexHeaderProps<Value extends string> {
  readonly found: number;
  readonly total: number;
  /** "6 of 61 places". */
  readonly placesLabel?: string;
  /** Friendly comparison ("Maya has 14"). */
  readonly comparison?: string;
  readonly filters: readonly DexFilterOption<Value>[];
  readonly filter: Value;
  readonly onFilter: (value: Value) => void;
  /**
   * A small control at the end of the title line (the person's own avatar, to their profile).
   * Without it the header is unchanged.
   */
  readonly end?: ReactNode;
  readonly testID?: string;
}

/** The design's size for the found/total count. */
const COUNT_SIZE = 48;

const useStyles = makeStyles((th) => ({
  track: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.md,
    padding: th.space['4'],
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: th.radius.sm },
}));

/** Critterdex header: found/total count, places pill, comparison and the All / Found / Near me filter. */
export function DexHeader<Value extends string>({
  found,
  total,
  placesLabel,
  comparison,
  filters,
  filter,
  onFilter,
  end,
  testID,
}: DexHeaderProps<Value>) {
  const styles = useStyles();
  const theme = useTheme();
  const spoken = t({
    id: 'common.critter.dexCount',
    message: `${found} of ${total} critters found`,
  });
  const title = (
    <Text variant="eyebrow">{t({ id: 'common.critter.yourDex', message: 'Your Critterdex' })}</Text>
  );
  return (
    <Stack gap="12" testID={testID}>
      {/* With an end control the title gets its own line, so the control sits opposite it. */}
      {end ? (
        <Row justify="space-between" align="center">
          {title}
          {end}
        </Row>
      ) : null}
      <Row justify="space-between" align="flex-end">
        <Stack accessible accessibilityRole="header" accessibilityLabel={spoken}>
          {end ? null : title}
          {/* One number, as the design sets it: the found count, then the total dimmed, at the
              same size (each fitted on its own would shrink the total). */}
          <Row align="baseline">
            <Text variant="h1" designSize={COUNT_SIZE} autoFit={false}>
              {String(found)}
            </Text>
            <Text
              variant="h1"
              designSize={COUNT_SIZE}
              autoFit={false}
              color={theme.semantic.text.secondary}
            >
              {`/${total}`}
            </Text>
          </Row>
        </Stack>
        <Stack gap="6" align="flex-end">
          {placesLabel ? <Tag label={placesLabel} color={theme.semantic.state.urgent} /> : null}
          {comparison ? (
            <Text variant="caption" color={theme.semantic.text.secondary}>
              {comparison}
            </Text>
          ) : null}
        </Stack>
      </Row>
      <Row style={styles.track} accessibilityRole="radiogroup">
        {filters.map((option) => {
          const checked = option.value === filter;
          return (
            <PressScale
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked }}
              onPress={() => onFilter(option.value)}
              style={[styles.segment, checked ? { backgroundColor: theme.color.paper.base } : null]}
            >
              <Text
                variant="label"
                color={checked ? theme.color.paper.ink : theme.semantic.text.secondary}
              >
                {option.label}
              </Text>
            </PressScale>
          );
        })}
      </Row>
    </Stack>
  );
}
