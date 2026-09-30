/**
 * One proposed change on the review screen (3e-3): the check that keeps or drops it (flipping on
 * each toggle), what it was struck through, what it becomes in bold, why, and the people it
 * touches. Dropped changes sit at 60%. Cards deal in, staggered.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { useDeal } from '@/motion/patterns/deal';
import { useFlap } from '@/motion/patterns/flap';
import { Icon } from '@/ui/icons/Icon';
import { AvatarStack, type StackMember } from '@/ui/people/AvatarStack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const CHECK = 30;

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    flexDirection: 'row',
    gap: th.space['12'],
  },
  check: {
    width: CHECK,
    height: CHECK,
    borderRadius: CHECK / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kept: { backgroundColor: th.semantic.state.success },
  dropped: { borderWidth: 2, borderColor: th.semantic.text.secondary },
  // Dropped changes read at 60% (3e-3).
  droppedCard: { opacity: 0.6 },
  body: { flex: 1, gap: th.space['2'] },
  foot: { flexDirection: 'row', alignItems: 'flex-end', gap: th.space['8'] },
}));

export interface ChangeCardViewProps {
  readonly index: number;
  /** Struck-through "was" line, or null for an added item. */
  readonly before: string | null;
  /** The new line, or null when the change removes the item. */
  readonly after: string | null;
  readonly reason: string;
  readonly people: readonly StackMember[];
  readonly accepted: boolean;
  /** Keeping or dropping is the author's, before the change set is sent. */
  readonly onToggle?: (() => void) | undefined;
  readonly testID?: string;
}

export function ChangeCardView({
  index,
  before,
  after,
  reason,
  people,
  accepted,
  onToggle,
  testID,
}: ChangeCardViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const deal = useDeal({ active: true, index });
  const { displayValue, style: flapStyle } = useFlap({ value: accepted });
  const removed = t({ id: 'plan.review.removed', message: 'Removed' });
  const added = t({ id: 'plan.review.added', message: 'New' });
  const headline = upper(after ?? removed, locale);
  const state = accepted
    ? t({ id: 'plan.review.kept', message: 'Kept' })
    : t({ id: 'plan.review.dropped', message: 'Dropped' });
  const label = [before ?? added, headline, reason, state].join(', ');
  const check = (
    <Animated.View style={[styles.check, displayValue ? styles.kept : styles.dropped, flapStyle]}>
      {displayValue ? (
        <Icon name="check" size={18} color={theme.semantic.text.onAccent} decorative />
      ) : (
        <Text variant="buttonSm" color={theme.semantic.text.secondary}>
          ✕
        </Text>
      )}
    </Animated.View>
  );
  return (
    <Animated.View style={deal} testID={testID}>
      <View style={[styles.card, accepted ? null : styles.droppedCard]}>
        {onToggle ? (
          <PressScale
            onPress={onToggle}
            widthClass="narrow"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            accessibilityLabel={label}
            accessibilityHint={t({
              id: 'plan.review.toggleHint',
              message: 'Keeps or drops this change',
            })}
            testID={testID === undefined ? undefined : `${testID}-toggle`}
          >
            {check}
          </PressScale>
        ) : (
          check
        )}
        <View style={styles.body} accessible={onToggle === undefined} accessibilityLabel={label}>
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            style={{ textDecorationLine: before === null ? 'none' : 'line-through' }}
          >
            {before ?? added}
          </Text>
          <Text variant="title">{headline}</Text>
          <View style={styles.foot}>
            <Text variant="bodySm" color={theme.semantic.text.secondary} style={{ flex: 1 }}>
              {reason}
            </Text>
            {people.length > 0 ? <AvatarStack members={people} size="sm" max={6} /> : null}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
