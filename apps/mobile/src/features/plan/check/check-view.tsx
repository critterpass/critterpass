/**
 * The plan check (7h-1), from props only: ← TRIP and when it last ran, Tokek over "3 TO FIX, 2 TO
 * KNOW", the cards dealt in worst first (a fade when motion is reduced), the dashed TO KNOW card,
 * an organiser's "Whose picks made it" row, a member's private ask on top, and FIX ALL pinned under
 * the list. Undesigned states: the check running, failed, and nothing to fix.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { tokens } from '@cp/design-tokens';

import { PillButton } from '@/ui/buttons/PillButton';
import { PressScale } from '@/ui/press/PressScale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { PlanGuideSticker } from '../plan-guide';
import { IssueCard, type IssueCardProps } from './issue-card';

export interface CheckViewProps {
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly status: string;
  readonly state: 'loading' | 'ready';
  readonly title: string;
  readonly body: string;
  /** Shown instead of the cards: running, failed, or nothing to fix. */
  readonly notice: string | null;
  readonly cards: readonly IssueCardProps[];
  readonly know: readonly string[];
  readonly ask: ReactNode;
  readonly balance: { readonly label: string; readonly onPress: () => void } | null;
  readonly fixAll: {
    readonly label: string;
    readonly busy: boolean;
    readonly onPress: () => void;
  } | null;
  readonly reducedMotion: boolean;
}

const DEAL_MS = 90;
const DEAL_RISE = 16;

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['24'],
    gap: th.space['12'],
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
  know: {
    gap: th.space['8'],
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
  },
  notice: {
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
  scroll: { flex: 1 },
  footer: {
    paddingHorizontal: th.space['20'],
    paddingTop: th.space['8'],
    paddingBottom: th.space['8'],
  },
}));

/** A card dealt in after the ones before it: it rises and fades in (a plain fade with motion reduced). */
function DealIn({
  index,
  reduced,
  children,
}: {
  readonly index: number;
  readonly reduced: boolean;
  readonly children: ReactNode;
}) {
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withDelay(
      reduced ? 0 : index * DEAL_MS,
      withTiming(1, { duration: tokens.motion.duration.base }),
    );
  }, [index, reduced, shown]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: reduced ? 0 : (1 - shown.value) * DEAL_RISE }],
  }));
  return (
    <Animated.View style={style} exiting={FadeOut}>
      {children}
    </Animated.View>
  );
}

export function CheckView(props: CheckViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="plan-check">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <BackEyebrow label={props.backLabel} onPress={props.onBack} />
          <View style={styles.chip} testID="plan-check-status">
            <Text variant="label" color={theme.semantic.text.secondary}>
              {props.status}
            </Text>
          </View>
        </View>
        {props.ask}
        <View style={styles.hero}>
          <PlanGuideSticker size={64} />
          <View style={styles.heroText}>
            <Text variant="h1" singleLine={false} testID="plan-check-title">
              {props.title}
            </Text>
          </View>
        </View>
        <Text variant="body" color={theme.semantic.text.secondary} singleLine={false}>
          {props.body}
        </Text>
        {props.state === 'loading' ? (
          <Skeleton preset="list" repeat={3} testID="plan-check-loading" />
        ) : null}
        {props.notice === null ? null : (
          <View style={styles.notice} testID="plan-check-notice">
            <Text variant="body" singleLine={false}>
              {props.notice}
            </Text>
          </View>
        )}
        {props.cards.map((card, index) => (
          <DealIn key={card.id} index={index} reduced={props.reducedMotion}>
            <IssueCard {...card} />
          </DealIn>
        ))}
        {props.know.length === 0 ? null : (
          <DealIn index={props.cards.length} reduced={props.reducedMotion}>
            <View style={styles.know} testID="plan-check-know">
              <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                {t({ id: 'plan.check.toKnow', message: 'To know' })}
              </Text>
              {props.know.map((line) => (
                <Text key={line} variant="bodySm" singleLine={false}>
                  {line}
                </Text>
              ))}
            </View>
          </DealIn>
        )}
        {props.balance === null ? null : (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={props.balance.label}
            onPress={props.balance.onPress}
            style={styles.row}
            testID="plan-check-balance"
          >
            <Text variant="rowTitle">{props.balance.label}</Text>
            <Text variant="rowTitle" color={theme.semantic.text.secondary}>
              ›
            </Text>
          </PressScale>
        )}
      </ScrollView>
      {props.fixAll === null ? null : (
        <View style={styles.footer}>
          <PillButton
            label={props.fixAll.label}
            onPress={props.fixAll.onPress}
            loading={props.fixAll.busy}
            block
            testID="plan-check-fix-all"
          />
        </View>
      )}
    </Scaffold>
  );
}
