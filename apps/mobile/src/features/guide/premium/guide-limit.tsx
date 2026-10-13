/**
 * The guide's meter in the premium thread: the "27 left" chip (5.13), the limit card in the
 * guide's own voice with its ring (5.19: Get Pass+, At midnight, and the crewmate with Pass+), and
 * the question waiting for midnight (5.20: Cancel, tap to reword it before then).
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Avatar,
  Button,
  Icon,
  PressableScale,
  Text,
  TextButton,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { useTrailOff } from '../meter/use-trail-off';
import type { GuideMeter } from '../meter/meter-model';
import { resetClock } from '../meter/meter-model';
import type { QueuedQuestion } from '../queued/use-queued-question';
import { GUIDE_PAINT, ring } from './guide-paint';

const useStyles = makePremiumStyles((th) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap6,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    backgroundColor: th.color.banner.guide.bg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: th.accent.sun,
    boxShadow: GUIDE_PAINT.quotaHalo,
  },
  card: {
    borderRadius: 24,
    padding: 16,
    gap: th.space.gap14,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.raised,
  },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: th.space.gap12 },
  ring: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: th.space.gap8 },
  handoff: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
  waiting: {
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: th.space.gap6,
    backgroundColor: th.color.card,
    boxShadow: ring(2, th.accent.sun),
  },
  waitingHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
}));

/** "27 left" on the free meter, "Unlimited Tokek" on a boosted trip, nothing with Pass+. */
export function QuotaChip({
  meter,
  guideName,
}: {
  readonly meter: GuideMeter;
  readonly guideName: string;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  if (meter.kind === 'unlimited') return null;
  const spent = meter.kind === 'free' && meter.used >= meter.limit;
  const left = meter.kind === 'free' ? Math.max(0, meter.limit - meter.used) : 0;
  const label =
    meter.kind === 'boosted'
      ? t({ id: 'guide.meter.unlimited', message: `Unlimited ${guideName}` })
      : spent
        ? t({ id: 'guide.meter.count', message: `${meter.used} of ${meter.limit} today` })
        : t({ id: 'guide.premium.left', message: `${left} left` });
  return (
    <View
      style={[styles.chip, spent ? { backgroundColor: th.color.status.voteOpen.bg } : null]}
      testID={`guide-meter-${meter.kind}`}
    >
      {spent ? null : <View style={styles.dot} />}
      <Text
        variant="badge"
        color={spent ? th.color.status.voteOpen.text : th.color.status.maybe.text}
      >
        {label}
      </Text>
    </View>
  );
}

export function LimitCard({
  guideName,
  used,
  limit,
  onGetPass,
  onAtMidnight,
  asking,
  passHolder,
  onCrewChat,
}: {
  readonly guideName: string;
  readonly used: number;
  readonly limit: number;
  readonly onGetPass?: () => void;
  readonly onAtMidnight?: () => void;
  readonly asking: boolean;
  readonly passHolder: { readonly name: string; readonly color: string } | null;
  readonly onCrewChat?: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const trailOff = useTrailOff(guideName, limit);
  const guide = guideName;
  return (
    <View style={{ gap: th.space.gap12 }} testID="guide-limit">
      <View style={styles.card}>
        <Text variant="guide" color={th.color.status.tangerine.text}>
          {trailOff}
        </Text>
        <View style={styles.ringRow}>
          <View style={[styles.ring, { borderColor: th.accent.tangerine }]}>
            <Text variant="rowTextStrong">{String(used)}</Text>
            <Text variant="statLabel" tone="muted">
              {t({ id: 'guide.premium.ofLimit', message: `of ${limit}` })}
            </Text>
          </View>
          <Text variant="captionMuted" tone="muted" style={{ flex: 1 }}>
            {t({
              id: 'guide.premium.passLine',
              message: `Pass+ keeps ${guide} talking: text, voice and camera, as much as you like.`,
            })}
          </Text>
        </View>
        <View style={styles.actions}>
          {onGetPass === undefined ? null : (
            <View style={{ flex: 1.3 }}>
              <Button
                size="small"
                label={t({ id: 'guide.limit.getPass', message: 'Get Pass+' })}
                onPress={onGetPass}
                testID="guide-limit-pass"
              />
            </View>
          )}
          {onAtMidnight === undefined ? null : (
            <View style={{ flex: 1 }}>
              <Button
                size="small"
                variant="control"
                label={t({ id: 'guide.premium.atMidnight', message: 'At midnight' })}
                onPress={onAtMidnight}
                loading={asking}
                testID="guide-limit-midnight"
              />
            </View>
          )}
        </View>
      </View>
      {passHolder === null || onCrewChat === undefined ? null : (
        <PressableScale
          style={styles.handoff}
          onPress={onCrewChat}
          accessibilityRole="button"
          testID="guide-limit-crew-chat"
        >
          <Avatar name={passHolder.name} color={passHolder.color} size={30} />
          <Text variant="rowText" style={{ flex: 1 }}>
            {t({
              id: 'guide.limit.hint',
              message: `${passHolder.name} has Pass+. Ask in the crew chat and ${guideName} answers there.`,
            })}
          </Text>
          <Icon name="forward" size={14} color={th.color.muted} />
        </PressableScale>
      )}
    </View>
  );
}

/** The question waiting for the reset; tapping it rewords it before then. */
export function WaitingCard({
  guideName,
  question,
  onCancel,
  onEdit,
}: {
  readonly guideName: string;
  readonly question: QueuedQuestion;
  readonly onCancel: () => void;
  readonly onEdit: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const locale = useLocale();
  const clock = resetClock(question.answerAfter, locale);
  return (
    <PressableScale
      style={styles.waiting}
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityHint={t({ id: 'guide.premium.rewordHint', message: 'Reword it before then' })}
      testID="guide-queued"
    >
      <View style={styles.waitingHead}>
        <Text variant="tier" color={th.color.status.maybe.text}>
          {t({ id: 'guide.queued.waiting', message: `Waiting for ${clock}` }).toLocaleUpperCase(
            locale,
          )}
        </Text>
        <TextButton
          label={t({ id: 'guide.queued.cancelAction', message: 'Cancel' })}
          onPress={onCancel}
          testID="guide-queued-cancel"
        />
      </View>
      <Text variant="rowTitle">{question.text}</Text>
      <Text variant="captionMuted" tone="muted">
        {t({
          id: 'guide.queued.body',
          message: `${guideName} answers this at ${clock} and lets you know quietly. It counts towards tomorrow.`,
        })}
      </Text>
    </PressableScale>
  );
}
