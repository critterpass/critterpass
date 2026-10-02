/**
 * The rows of 3k-5 that need nothing from the crew: ALREADY DONE (a tick each, which ticks in when
 * the row really completes), what is still on its way (a dashed ring), what went wrong (a vendor
 * who did not answer, a fix that failed) and the traveller's own links (rebook with the airline).
 */
import { tokens } from '@cp/design-tokens';
import type { DisruptionAction } from '@cp/domain';
import { upper } from '@cp/i18n';
import { View } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { rowLine } from './copy';

export type RowsTone = 'done' | 'working' | 'problem';

export interface FlightRowsProps {
  readonly title: string;
  readonly tone: RowsTone;
  readonly rows: readonly DisruptionAction[];
  readonly testID: string;
}

const useStyles = makeStyles((th) => ({
  mark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashed: { borderWidth: 2, borderStyle: 'dashed', borderColor: th.semantic.text.tertiary },
  rule: { height: 1, backgroundColor: th.semantic.border.decorative },
  line: { flex: 1 },
}));

const TICK_SPRING = { damping: 14 };

function Mark({ tone }: { readonly tone: RowsTone }) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  // A tick pops in when its row lands here: the moment the guide's change really completed.
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = reduced
      ? withTiming(1, { duration: tokens.motion.duration.instant })
      : withSpring(1, TICK_SPRING);
  }, [reduced, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  if (tone === 'working') return <View style={[styles.mark, styles.dashed]} />;
  const fill = tone === 'done' ? theme.semantic.state.success : theme.semantic.state.warning;
  return (
    <Animated.View style={[styles.mark, { backgroundColor: fill }, popStyle]}>
      <Icon
        name={tone === 'done' ? 'check' : 'bell'}
        size={14}
        color={theme.semantic.text.onAccent}
        decorative
      />
    </Animated.View>
  );
}

export function FlightRows({ title, tone, rows, testID }: FlightRowsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  if (rows.length === 0) return null;
  const eyebrow =
    tone === 'done'
      ? theme.semantic.state.success
      : tone === 'problem'
        ? theme.semantic.state.warning
        : theme.semantic.text.secondary;
  return (
    <Card tone="raised" testID={testID}>
      <Stack gap="10">
        <Text variant="eyebrow" color={eyebrow}>
          {upper(title, locale)}
        </Text>
        {rows.map((row, index) => (
          <Stack gap="10" key={row.id}>
            {index === 0 ? null : <View style={styles.rule} />}
            <Row gap="12" align="center" testID={`${testID}-${row.id}`}>
              <Mark tone={tone} />
              <Text
                variant="body"
                singleLine={false}
                style={styles.line}
                color={
                  tone === 'working' ? theme.semantic.text.secondary : theme.semantic.text.primary
                }
              >
                {rowLine(row, locale)}
              </Text>
            </Row>
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}

/** The traveller's own steps (rebook with the airline): links, never something we did. */
export function FlightLinks(props: {
  readonly rows: readonly DisruptionAction[];
  readonly onOpen: (row: DisruptionAction) => void;
}) {
  const locale = useLocale();
  if (props.rows.length === 0) return null;
  return (
    <Stack gap="8" testID="disruption-links">
      {props.rows.map((row) => (
        <TextLink
          key={row.id}
          label={rowLine(row, locale)}
          onPress={() => props.onOpen(row)}
          testID={`disruption-link-${row.kind}`}
        />
      ))}
    </Stack>
  );
}
