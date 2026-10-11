/**
 * "Tokek suggests" on the invite sheet: the caller's own invites nobody has answered yet, as a
 * silhouette and a count (people who have not joined are never named), and Resend. A tap sends
 * now; a long press waits for the invitee's usual hour. The answer is one toast for all of them.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { format } from '@cp/i18n';

import { clockOption } from '@/lib/i18n/formats';
import { Card, Icon, PressableScale, Spinner, Text, usePremiumTheme, useToast } from '@/ui/premium';

import type { ResendSummary, ResendWhen } from '../resend-summary';

export interface ResendCardProps {
  readonly count: number;
  readonly sending: boolean;
  readonly onResend: (when: ResendWhen) => Promise<ResendSummary>;
}

export function ResendCard({ count, sending, onResend }: ResendCardProps) {
  const th = usePremiumTheme();
  const toast = useToast();
  const { t, i18n } = useLingui();
  if (count === 0) return null;

  const say = (summary: ResendSummary) => {
    switch (summary.kind) {
      case 'sent':
        toast.show({
          kind: 'done',
          message: t({ id: 'crew.premium.resend.sent', message: 'Sent again.' }),
        });
        return;
      case 'scheduled': {
        const at = summary.at;
        toast.show({
          kind: 'done',
          message: t({
            id: 'crew.premium.resend.scheduled',
            message: `Tokek will send it at ${at}, their time.`,
          }),
        });
        return;
      }
      case 'too_soon': {
        const when = format.time(i18n.locale, summary.nextAt, clockOption());
        toast.show({
          kind: 'error',
          message: t({
            id: 'crew.premium.resend.tooSoon',
            message: `You sent one recently. Try again after ${when}.`,
          }),
        });
        return;
      }
      case 'failed':
        toast.show({
          kind: 'error',
          message: t({
            id: 'crew.premium.resend.failed',
            message: 'It didn’t send. Check your connection and try again.',
          }),
        });
        return;
      case 'relayed':
        return;
    }
  };
  const run = (when: ResendWhen) => {
    if (!sending) void onResend(when).then(say);
  };

  return (
    <Card radius={20} style={styles.card} testID="crew-invite-resend">
      <View style={[styles.face, { backgroundColor: th.color.control }]}>
        <Icon name="people" size={18} color={th.color.muted} />
      </View>
      <View style={styles.grow}>
        <Text variant="caption" tone="muted">
          {t({ id: 'crew.premium.resend.who', message: 'Tokek suggests' })}
        </Text>
        <Text variant="caption">
          {t({
            id: 'crew.premium.resend.line',
            message: plural(count, {
              one: 'One of your invites hasn’t been answered yet.',
              other: '# of your invites haven’t been answered yet.',
            }),
          })}
        </Text>
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t({ id: 'crew.premium.resend.action', message: 'Resend' })}
        accessibilityHint={t({
          id: 'crew.premium.resend.hint',
          message: 'Hold to send it at their usual hour instead.',
        })}
        onPress={() => run('now')}
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a wire value, never copy.
        onLongPress={() => run('their_hour')}
        style={[styles.pill, { backgroundColor: th.color.ink }]}
        testID="crew-invite-resend-button"
      >
        {sending ? (
          <Spinner size={16} color={th.color.onInk} />
        ) : (
          <Text variant="pillSmall" color={th.color.onInk}>
            {t({ id: 'crew.premium.resend.action', message: 'Resend' })}
          </Text>
        )}
      </PressableScale>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  face: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, gap: 2 },
  pill: { height: 34, borderRadius: 17, paddingHorizontal: 14, justifyContent: 'center' },
});
