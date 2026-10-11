/**
 * A needs-you card answered in place (3.17): the speaker's thumb (the guide on its tint, else a
 * tinted tile), the question 16/600 and its line, and the answers as 38 pt pills (the primary in
 * ink). An answered card folds away on the Smooth spring (a fade under Reduce Motion) and then
 * leaves the list; an expired one stays, closed, without answers.
 */
import type { InboxAction } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  CritterSticker,
  PressableScale,
  REDUCED_FADE_MS,
  SPRINGS,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { guideArt } from '../../guide-art';
import type { InboxItem } from '../../inbox/inbox-data';
import type { InboxRenderContext, InboxRenderer } from '../../inbox/kind-renderers';

const useStyles = makePremiumStyles((t) => ({
  card: {
    borderRadius: t.radius.card,
    backgroundColor: t.color.card,
    boxShadow: t.shadow.card,
    padding: t.space.rowPadH,
    gap: t.space.gap12,
  },
  head: { flexDirection: 'row', gap: t.space.gap12, alignItems: 'center' },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, gap: 2 },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.gap8 },
  answer: {
    height: 38,
    borderRadius: 19,
    paddingHorizontal: t.space.gap16,
    justifyContent: 'center',
  },
}));

export interface PremiumInboxCardProps {
  readonly item: InboxItem;
  readonly renderer: InboxRenderer;
  readonly ctx: InboxRenderContext;
  readonly expired: boolean;
  readonly handled: boolean;
  readonly onAction: (item: InboxItem, action: InboxAction) => void;
  readonly onDismissed: (item: InboxItem) => void;
}

export function PremiumInboxCard({
  item,
  renderer,
  ctx,
  expired,
  handled,
  onAction,
  onDismissed,
}: PremiumInboxCardProps) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const { t } = useLingui();
  const shown = useSharedValue(1);
  useEffect(() => {
    if (!handled) return;
    const done = (finished?: boolean) => {
      'worklet';
      if (finished === true) runOnJS(onDismissed)(item);
    };
    shown.value = reduced
      ? withTiming(0, { duration: REDUCED_FADE_MS }, done)
      : withSpring(0, SPRINGS.smooth, done);
  }, [handled, reduced, shown, item, onDismissed]);
  const fold = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: 0.96 + 0.04 * shown.value }],
    maxHeight: 600 * shown.value,
  }));
  const copy = renderer.card?.(item, ctx) ?? { title: renderer.line(item, ctx) };
  const body = expired
    ? t({ id: 'home.inbox.closed', message: 'This one has closed.' })
    : copy.body;
  const guide =
    item.source === 'guide'
      ? guideArt(typeof item.data['guide'] === 'string' ? item.data['guide'] : null)
      : null;
  return (
    <Animated.View style={fold}>
      <View style={styles.card} testID={`inbox-card-${item.id}`}>
        <View style={styles.head}>
          <View
            style={[
              styles.thumb,
              {
                backgroundColor:
                  guide === null ? theme.color.status.rain.bg : theme.color.banner.guide.bg,
              },
            ]}
          >
            {guide === null ? (
              <Text variant="headline" color={theme.color.status.rain.text}>
                {(item.actorName || item.crewName).slice(0, 1).toUpperCase()}
              </Text>
            ) : (
              <CritterSticker
                kind={guide.kind}
                name={guide.name}
                seed={guide.seed}
                size={44}
                pose="think"
              />
            )}
          </View>
          <View style={styles.grow}>
            <Text variant="headline">{copy.title}</Text>
            {body === undefined ? null : (
              <Text variant="note" tone="muted">
                {body}
              </Text>
            )}
          </View>
        </View>
        {expired || item.actions.length === 0 ? null : (
          <View style={styles.answers}>
            {item.actions.map((action) => {
              const primary = action.style === 'primary';
              const label =
                renderer.actionLabel?.(action, item, ctx) ??
                (action.command === 'send_nudge'
                  ? t({ id: 'home.inbox.action.nudge', message: 'Nudge' })
                  : action.id);
              return (
                <PressableScale
                  key={action.id}
                  onPress={() => onAction(item, action)}
                  disabled={handled}
                  accessibilityLabel={label}
                  testID={`inbox-action-${item.id}-${action.id}`}
                >
                  <View
                    style={[
                      styles.answer,
                      { backgroundColor: primary ? theme.color.ink : theme.color.control },
                    ]}
                  >
                    <Text variant="buttonSmall" tone={primary ? 'onInk' : 'ink'} numberOfLines={1}>
                      {label}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </View>
        )}
      </View>
    </Animated.View>
  );
}
