import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import { Segmented } from '../inputs/Segmented';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Tag } from '../plan/ActionPill';
import { Text } from '../text/Text';
import { useTheme } from '../theme';

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
  /** What the filter chooses, read before its options. @default the header's title */
  readonly filterLabel?: string;
  /**
   * A small control at the end of the title line (the person's own avatar, to their profile).
   * Without it the header is unchanged.
   */
  readonly end?: ReactNode;
  readonly testID?: string;
}

/** The design's size for the found/total count. */
const COUNT_SIZE = 48;

/** Critterdex header: found/total count, places pill, comparison and the All / Found / Near me filter. */
export function DexHeader<Value extends string>({
  found,
  total,
  placesLabel,
  comparison,
  filters,
  filter,
  onFilter,
  filterLabel,
  end,
  testID,
}: DexHeaderProps<Value>) {
  const theme = useTheme();
  const spoken = t({
    id: 'common.critter.dexCount',
    message: `${found} of ${total} critters found`,
  });
  const yourDex = t({ id: 'common.critter.yourDex', message: 'Your Critterdex' });
  const title = <Text variant="eyebrow">{yourDex}</Text>;
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
      <Segmented
        segments={filters}
        value={filter}
        onChange={onFilter}
        label={filterLabel ?? yourDex}
        {...(testID === undefined ? {} : { testID: `${testID}-filter` })}
      />
    </Stack>
  );
}
