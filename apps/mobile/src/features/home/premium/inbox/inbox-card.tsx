/**
 * A needs-you card answered in place (3.17): the speaker's round thumb (the guide on its tint, a
 * crewmate's avatar in their colour), the question 16/600 and its line, and the answers as 38 pt
 * pills sharing the row (the primary in ink); a lone answer sits beside the question. An answered card folds away
 * (fade and scale to 0.96 on the Smooth spring, a fade under Reduce Motion), then leaves the list
 * and the cards below close up on the same spring; an expired one stays, closed, without answers.
 */
import type { InboxAction } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  Avatar,
  CritterSticker,
  layoutTransition,
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
import { memberAccent } from '../components/member-colour';

const SLOTS = ['yellow', 'orange', 'blue', 'pink', 'green', 'cream'] as const;
const THUMB = 48;

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
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  grow: { flex: 1, gap: 2 },
  answers: { flexDirection: 'row', gap: t.space.gap8 },
  shared: { flex: 1 },
  answer: {
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: t.space.gap16,
    alignItems: 'center',
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
      if (finished === true) scheduleOnRN(onDismissed, item);
    };
    shown.value = reduced
      ? withTiming(0, { duration: REDUCED_FADE_MS }, done)
      : withSpring(0, SPRINGS.smooth, done);
  }, [handled, reduced, shown, item, onDismissed]);
  const fold = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: 0.96 + 0.04 * shown.value }],
  }));
  const copy = renderer.card?.(item, ctx) ?? { title: renderer.line(item, ctx) };
  const body = expired
    ? t({ id: 'home.inbox.closed', message: 'This one has closed.' })
    : copy.body;
  const guide =
    item.source === 'guide'
      ? guideArt(typeof item.data['guide'] === 'string' ? item.data['guide'] : null)
      : null;
  const shared = item.actions.length > 1;
  const pills =
    expired || item.actions.length === 0
      ? []
      : item.actions.map((action) => {
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
              {...(shared ? { style: styles.shared } : {})}
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
        });
  return (
    <Animated.View style={fold} layout={layoutTransition(reduced)}>
      <View style={styles.card} testID={`inbox-card-${item.id}`}>
        <View style={styles.head}>
          {guide === null ? (
            <Avatar
              name={item.actorName || item.crewName}
              color={memberAccent(theme, SLOTS[item.actorJoinIndex % SLOTS.length])}
              size={THUMB}
            />
          ) : (
            <View style={[styles.thumb, { backgroundColor: theme.color.banner.guide.bg }]}>
              <CritterSticker
                kind={guide.kind}
                name={guide.name}
                seed={guide.seed}
                size={44}
                pose="think"
              />
            </View>
          )}
          <View style={styles.grow}>
            <Text variant="headline">{copy.title}</Text>
            {body === undefined ? null : (
              <Text variant="note" tone="muted">
                {body}
              </Text>
            )}
          </View>
          {pills.length === 1 ? pills : null}
        </View>
        {pills.length > 1 ? <View style={styles.answers}>{pills}</View> : null}
      </View>
    </Animated.View>
  );
}
