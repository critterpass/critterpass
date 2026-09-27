import { t } from '@lingui/core/macro';

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
  readonly testID?: string;
}

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
  testID,
}: DexHeaderProps<Value>) {
  const styles = useStyles();
  const theme = useTheme();
  const spoken = t({
    id: 'common.critter.dexCount',
    message: `${found} of ${total} critters found`,
  });
  return (
    <Stack gap="12" testID={testID}>
      <Row justify="space-between" align="flex-end">
        <Stack accessible accessibilityRole="header" accessibilityLabel={spoken}>
          <Text variant="eyebrow">
            {t({ id: 'common.critter.yourDex', message: 'Your Critterdex' })}
          </Text>
          <Row align="baseline">
            <Text variant="displayHero">{String(found)}</Text>
            <Text variant="displayHero" color={theme.semantic.text.secondary}>
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
