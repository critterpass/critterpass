/**
 * Rain and crowds (7h-4), from props only: ← the day with when Tokek checks again; Tokek over
 * "RAIN AT 1, CROWDS AT 10"; where the numbers come from; the chart; each swap with its tick, its
 * colour, the old time struck through and the new one, and why; USE ALL pinned under the list with
 * "Send to the crew first". Undesigned: loading, and nothing to swap.
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Icon } from '@/ui/icons/Icon';
import { PressScale } from '@/ui/press/PressScale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { SwapChart, type SwapChartProps } from './swap-chart';

export interface SwapRowView {
  readonly key: string;
  readonly name: string;
  readonly color: string;
  readonly from: string;
  readonly to: string;
  readonly why: string;
  readonly ticked: boolean;
}

export interface RainViewProps {
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly chip: string | null;
  readonly title: string;
  readonly source: string;
  readonly state: 'loading' | 'none' | 'ready';
  readonly chart: SwapChartProps | null;
  readonly rows: readonly SwapRowView[];
  readonly onToggle: (key: string) => void;
  readonly primary: {
    readonly label: string;
    readonly busy: boolean;
    readonly onPress: () => void;
  } | null;
  readonly send: (() => void) | null;
}

const TICK = 26;

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['24'],
    gap: th.space['14'],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: {
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['4'],
    backgroundColor: th.semantic.bg.control,
  },
  hero: { flexDirection: 'row', alignItems: 'center', gap: th.space['12'] },
  heroText: { flex: 1, minWidth: 0 },
  list: { borderRadius: th.radius.lg, backgroundColor: th.semantic.bg.raised },
  row: { flexDirection: 'row', gap: th.space['12'], padding: th.space['14'], alignItems: 'center' },
  tick: {
    width: TICK,
    height: TICK,
    borderRadius: TICK / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0, gap: th.space['2'] },
  line: { flexDirection: 'row', alignItems: 'center', gap: th.space['6'], flexWrap: 'wrap' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  notice: {
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
  scroll: { flex: 1 },
  footer: {
    gap: th.space['12'],
    alignItems: 'center',
    paddingHorizontal: th.space['20'],
    paddingTop: th.space['8'],
    paddingBottom: th.space['8'],
  },
}));

export function RainView(props: RainViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="plan-rain">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <BackEyebrow label={props.backLabel} onPress={props.onBack} />
          {props.chip === null ? null : (
            <View style={styles.chip} testID="plan-rain-chip">
              <Text variant="label" color={theme.semantic.text.secondary}>
                {props.chip}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.hero}>
          <Sticker kind="gecko" name="Tokek" size={64} />
          <View style={styles.heroText}>
            <Text variant="h1" singleLine={false} testID="plan-rain-title">
              {props.title}
            </Text>
          </View>
        </View>
        <Text variant="body" color={theme.semantic.text.secondary} singleLine={false}>
          {props.source}
        </Text>
        {props.state === 'loading' ? <Skeleton preset="list" repeat={3} /> : null}
        {props.chart === null ? null : <SwapChart {...props.chart} />}
        {props.state === 'none' ? (
          <View style={styles.notice} testID="plan-rain-none">
            <Text variant="body" singleLine={false}>
              {t({
                id: 'plan.check.rain.noneBody',
                message: 'Nothing to swap. Every block is dry and quiet enough where it is.',
              })}
            </Text>
          </View>
        ) : null}
        {props.rows.length === 0 ? null : (
          <View style={styles.list} testID="plan-rain-swaps">
            {props.rows.map((row) => (
              <PressScale
                key={row.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: row.ticked }}
                accessibilityLabel={`${row.name}, ${row.from} → ${row.to}`}
                onPress={() => props.onToggle(row.key)}
                style={styles.row}
                testID={`plan-rain-swap-${row.key}`}
              >
                <View
                  style={[
                    styles.tick,
                    {
                      backgroundColor: row.ticked ? theme.semantic.state.success : 'transparent',
                      borderColor: row.ticked
                        ? theme.semantic.state.success
                        : theme.semantic.border.decorative,
                    },
                  ]}
                >
                  {row.ticked ? (
                    <Icon name="check" size={14} color={tokens.color.paper.ink} decorative />
                  ) : null}
                </View>
                <View style={styles.body}>
                  <View style={styles.line}>
                    <View style={[styles.dot, { backgroundColor: row.color }]} />
                    <Text variant="title" numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text
                      variant="monoData"
                      color={theme.semantic.text.secondary}
                      style={{ textDecorationLine: 'line-through' }}
                    >
                      {row.from}
                    </Text>
                    <Text variant="monoData" color={tokens.color.yellow}>
                      {`→ ${row.to}`}
                    </Text>
                  </View>
                  <Text variant="bodySm" color={theme.semantic.text.secondary} singleLine={false}>
                    {row.why}
                  </Text>
                </View>
              </PressScale>
            ))}
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        {props.primary === null ? null : (
          <PillButton
            label={props.primary.label}
            onPress={props.primary.onPress}
            loading={props.primary.busy}
            disabled={props.state !== 'ready'}
            block
            testID="plan-rain-use"
          />
        )}
        {props.send === null || props.state !== 'ready' ? null : (
          <TextLink
            label={t({ id: 'plan.check.rain.sendFirst', message: 'Send to the crew first' })}
            onPress={props.send}
            testID="plan-rain-send"
          />
        )}
      </View>
    </Scaffold>
  );
}
