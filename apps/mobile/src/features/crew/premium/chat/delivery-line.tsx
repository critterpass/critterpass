/**
 * The line under your own message (5.03): "Read by N" once crewmates have read it, "Sent 4:10"
 * before that, a clock and "Waiting for signal" while it queues (media adds its size), and for a
 * refused send the reason with Retry and Delete. The text of a failed message is kept.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Icon, PressableScale, Text, makePremiumStyles, usePremiumTheme } from '@/ui/premium';

import { useActiveLocale } from '@/lib/i18n/use-locale';

import { timeOf } from '../../chat/components/format';
import type { ChatMessage } from '../../chat/data/rows';

const useStyles = makePremiumStyles((th) => ({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap4,
    marginTop: th.space.gap4,
  },
  actions: { flexDirection: 'row', gap: th.space.gap8, marginTop: th.space.gap6 },
  retry: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap6,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: th.color.inkSurface,
  },
  delete: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: th.color.segmentTrack,
  },
}));

function clock(iso: string, locale: string): string {
  return Number.isNaN(Date.parse(iso)) ? '' : timeOf(iso, locale);
}

/** Why a send was refused, in the sender's words. */
export function failureLine(code: string | undefined): string {
  if (code === 'PAYLOAD_TOO_LARGE') {
    return t({
      id: 'chat.premium.failed.tooBig',
      message: "Didn't send · too big for this signal",
    });
  }
  if (code === 'FORBIDDEN') {
    return t({
      id: 'chat.premium.failed.forbidden',
      message: "Didn't send · you can't post here now",
    });
  }
  return t({ id: 'chat.premium.failed', message: "Didn't send" });
}

export function DeliveryLine({
  message,
  readBy,
  onRetry,
  onDiscard,
}: {
  readonly message: ChatMessage;
  readonly readBy: number;
  readonly onRetry: () => void;
  readonly onDiscard: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const locale = useActiveLocale();
  if (message.deleted) return null;
  if (message.status === 'failed') {
    return (
      <View style={{ alignItems: 'flex-end' }} testID={`chat-failed-${message.id}`}>
        <Text
          variant="helper"
          color={th.color.destructive.helper}
          style={{ marginTop: th.space.gap4 }}
        >
          {failureLine(message.failureCode)}
        </Text>
        <View style={styles.actions}>
          <PressableScale
            style={styles.retry}
            onPress={onRetry}
            accessibilityRole="button"
            testID="chat-retry"
          >
            <Icon name="retry" size={13} color={th.color.onInkSurface} />
            <Text variant="toastAction" color={th.color.onInkSurface}>
              {t({ id: 'chat.premium.retry', message: 'Retry' })}
            </Text>
          </PressableScale>
          <PressableScale
            style={styles.delete}
            onPress={onDiscard}
            accessibilityRole="button"
            testID="chat-discard"
          >
            <Text variant="toastAction">{t({ id: 'chat.premium.delete', message: 'Delete' })}</Text>
          </PressableScale>
        </View>
      </View>
    );
  }
  if (message.status === 'sending' || message.status === 'uploaded') {
    return (
      <View style={styles.line}>
        <Icon name="offline" size={12} color={th.color.muted} />
        <Text variant="badge" tone="muted">
          {t({ id: 'chat.premium.waiting', message: 'Waiting for signal' })}
        </Text>
      </View>
    );
  }
  if (readBy > 0) {
    return (
      <Text
        variant="badge"
        tone="placeholder"
        style={{ marginTop: th.space.gap4 }}
        testID="chat-read-by"
      >
        {t({ id: 'chat.premium.readBy', message: `Read by ${readBy}` })}
      </Text>
    );
  }
  const time = clock(message.createdAt, locale);
  return (
    <View style={styles.line}>
      <Icon name="check" size={12} color={th.color.status.booked.text} />
      <Text variant="badge" color={th.color.status.booked.text}>
        {t({ id: 'chat.premium.sent', message: `Sent ${time}` })}
      </Text>
    </View>
  );
}
