/**
 * Out of questions (4b-1): the guide trails off mid-sentence, then the limit card slides up under
 * the line: "30 OF 30 TODAY · RESETS 00:00", the filled meter (the last segment flicks yellow),
 * what Pass+ gives, GET PASS+ and ASK AT MIDNIGHT; a crewmate with Pass+ is offered as a hint row
 * ("Maya has Pass+. Ask in the crew chat and Pon answers there."). The composer becomes the
 * countdown ("Pon is back in 7h 12m"). Nothing outside this chat is blocked.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';

import { patterns } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Row, Stack, Text, makeStyles, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { Composer } from '@/ui/chat/Composer';
import { PressScale } from '@/ui/press/PressScale';
import { Avatar } from '@/ui/people/Avatar';

import { resetClock, untilReset } from './meter-model';

const useStyles = makeStyles((t) => ({
  card: { borderWidth: 2, borderColor: t.semantic.action.primary },
  track: { flexDirection: 'row', gap: t.space['4'] },
  cell: { flex: 1, height: 12, borderRadius: t.radius.xs },
  half: { flex: 1 },
  hint: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['12'],
    gap: t.space['12'],
    alignItems: 'center',
  },
  bar: { alignItems: 'center', gap: t.space['8'] },
  plus: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: t.semantic.bg.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: t.semantic.bg.raised,
    paddingHorizontal: t.space['16'],
    justifyContent: 'center',
  },
}));

/** The last segment flicks from empty to yellow as the final answer lands. */
function LastCell({ style }: { readonly style: object }) {
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const lit = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced)
      lit.value = withDelay(
        tokens.motion.duration.fast,
        withTiming(1, { duration: tokens.motion.duration.instant }),
      );
  }, [lit, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: lit.value }));
  return (
    <View style={[style, { backgroundColor: theme.semantic.bg.control }]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          style,
          { backgroundColor: theme.semantic.action.primary },
          animated,
        ]}
      />
    </View>
  );
}

export function useTrailOff(guideName: string, limit: number): string {
  const { t } = useLingui();
  return limit === 30
    ? t({
        id: 'guide.limit.trailOff30',
        message: `That's my thirtieth answer today, and the free ones are used up. I'll be back at midnight, or…`,
      })
    : t({
        id: 'guide.limit.trailOff',
        message: `That's all my free answers for today. ${guideName} will be back at midnight, or…`,
      });
}

export interface LimitCardProps {
  readonly guideName: string;
  readonly color: string;
  readonly used: number;
  readonly limit: number;
  readonly resetAt: string | null;
  /** The trip's place, for "Your Kyoto plan and the vote don't count towards this." */
  readonly destination: string | null;
  readonly onGetPass?: () => void;
  /** Absent once the question is queued (or there is no question to queue). */
  readonly onAskAtMidnight?: () => void;
  readonly asking?: boolean;
  /** A crewmate with Pass+ (first name and join order), offered as the crew chat hint. */
  readonly passHolder?: { readonly name: string; readonly joinIndex: number } | null;
  readonly onCrewChat?: () => void;
}

export function LimitCard(props: LimitCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const dealt = patterns.useDeal({ active: true, index: 3 });
  const trail = useTrailOff(props.guideName, props.limit);
  const { used, limit, guideName } = props;
  const clock = props.resetAt === null ? '00:00' : resetClock(props.resetAt, i18n.locale);
  const place = props.destination;
  return (
    <Stack gap="16" testID="guide-limit">
      <Text variant="voice" color={props.color}>
        {trail}
      </Text>
      <Animated.View style={dealt}>
        <Card tone="raised" style={styles.card} testID="guide-limit-card">
          <Stack gap="12">
            <Row justify="space-between" align="center" wrap gap="8">
              <Text variant="h3">
                {upper(
                  t({ id: 'guide.limit.count', message: `${used} of ${limit} today` }),
                  i18n.locale,
                )}
              </Text>
              <Text variant="monoData" color={theme.semantic.text.secondary}>
                {upper(t({ id: 'guide.limit.resets', message: `Resets ${clock}` }), i18n.locale)}
              </Text>
            </Row>
            <View
              style={styles.track}
              accessible
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: limit, now: Math.min(used, limit) }}
            >
              {Array.from({ length: limit }, (_, index) =>
                index === limit - 1 && used >= limit ? (
                  <LastCell key={index} style={styles.cell} />
                ) : (
                  <View
                    key={index}
                    style={[
                      styles.cell,
                      {
                        backgroundColor:
                          index < used ? theme.semantic.action.primary : theme.semantic.bg.control,
                      },
                    ]}
                  />
                ),
              )}
            </View>
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {place === null
                ? t({
                    id: 'guide.limit.body',
                    message: `Pass+ keeps ${guideName} talking: text, voice and camera, as much as you like. Your plan and the vote don't count towards this.`,
                  })
                : t({
                    id: 'guide.limit.bodyTrip',
                    message: `Pass+ keeps ${guideName} talking: text, voice and camera, as much as you like. Your ${place} plan and the vote don't count towards this.`,
                  })}
            </Text>
            <Row gap="8">
              {props.onGetPass === undefined ? null : (
                <View style={styles.half}>
                  <PillButton
                    label={t({ id: 'guide.limit.getPass', message: 'Get Pass+' })}
                    onPress={props.onGetPass}
                    block
                    testID="guide-limit-pass"
                  />
                </View>
              )}
              {props.onAskAtMidnight === undefined ? null : (
                <View style={styles.half}>
                  <PillButton
                    variant="secondary"
                    label={t({ id: 'guide.limit.askAtMidnight', message: 'Ask at midnight' })}
                    onPress={props.onAskAtMidnight}
                    loading={props.asking === true}
                    block
                    testID="guide-limit-queue"
                  />
                </View>
              )}
            </Row>
          </Stack>
        </Card>
      </Animated.View>
      {props.passHolder === undefined || props.passHolder === null ? null : (
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={t({
            id: 'guide.limit.hintLabel',
            message: `${props.passHolder.name} has Pass+. Ask in the crew chat`,
          })}
          onPress={props.onCrewChat ?? (() => undefined)}
          testID="guide-limit-hint"
        >
          <Row style={styles.hint}>
            <Avatar
              name={props.passHolder.name}
              joinIndex={props.passHolder.joinIndex}
              size="sm"
              decorative
            />
            <Text variant="bodySm" style={styles.half}>
              {t({
                id: 'guide.limit.hint',
                message: `${props.passHolder.name} has Pass+. Ask in the crew chat and ${guideName} answers there.`,
              })}
            </Text>
            <Text variant="title" color={theme.semantic.action.primary}>
              ›
            </Text>
          </Row>
        </PressScale>
      )}
    </Stack>
  );
}

/** The composer while the meter is spent: "+" stays, the field counts down to the reset. */
export function LimitComposer({
  guideName,
  resetAt,
  now,
  onAttach,
}: {
  readonly guideName: string;
  readonly resetAt: string | null;
  readonly now: Date;
  readonly onAttach?: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const left = resetAt === null ? null : untilReset(resetAt, now);
  const line =
    left === null
      ? t({ id: 'guide.limit.backAtMidnight', message: `${guideName} is back at midnight` })
      : t({
          id: 'guide.limit.backIn',
          message: `${guideName} is back in ${left.hours}h ${left.minutes}m`,
        });
  return (
    <Row style={styles.bar} testID="guide-limit-composer">
      <PressScale
        accessibilityLabel={t({ id: 'guide.limit.attach', message: 'Add attachment' })}
        onPress={onAttach ?? (() => undefined)}
        widthClass="narrow"
        style={styles.plus}
      >
        <Text variant="h3">+</Text>
      </PressScale>
      <View style={styles.field} accessible accessibilityLabel={line}>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {line}
        </Text>
      </View>
    </Row>
  );
}

/** ASK AT MIDNIGHT with no refused question: whatever is sent here waits for the reset. */
export function QueueComposer({
  guideName,
  value,
  onChangeText,
  onSend,
}: {
  readonly guideName: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly onSend: () => void;
}) {
  const { t } = useLingui();
  return (
    <Composer
      value={value}
      onChangeText={onChangeText}
      onSend={onSend}
      placeholder={t({
        id: 'guide.limit.queuePlaceholder',
        message: `Ask now, ${guideName} answers at midnight`,
      })}
      testID="guide-limit-queue-composer"
    />
  );
}
