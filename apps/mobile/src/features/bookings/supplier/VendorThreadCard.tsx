/**
 * A message to a place (3e-2, 3k-5, 3k-9, truthful): the exact text before it leaves ("Draft ready
 * — send?"), then "Sent {time}, waiting", then the place's reply verbatim ("{vendor} replied: …").
 * Nothing says a table is held or a pickup moved until the place itself says so.
 */
/* eslint-disable lingui/no-unlocalized-strings -- message statuses and channels, wire values. */
import type { VendorThreadView } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export type ThreadPhase = 'draft' | 'self_send' | 'approved' | 'waiting' | 'replied' | 'failed';

type Message = VendorThreadView['messages'][number];

/** Where a thread stands, from its newest outbound message and any reply after it. */
export function threadPhase(thread: VendorThreadView): {
  readonly phase: ThreadPhase;
  readonly outbound: Message | null;
  readonly reply: Message | null;
} {
  const outbound = [...thread.messages].reverse().find((m) => m.direction === 'outbound') ?? null;
  const reply = [...thread.messages].reverse().find((m) => m.direction === 'inbound') ?? null;
  if (reply !== null && (outbound === null || reply.at >= outbound.at))
    return { phase: 'replied', outbound, reply };
  if (outbound === null) return { phase: 'waiting', outbound, reply };
  if (outbound.status === 'draft')
    return { phase: thread.channel === 'self_send' ? 'self_send' : 'draft', outbound, reply };
  if (outbound.status === 'approved') return { phase: 'approved', outbound, reply };
  if (outbound.status === 'failed') return { phase: 'failed', outbound, reply };
  return { phase: 'waiting', outbound, reply };
}

export interface VendorThreadCardProps {
  readonly vendor: string;
  readonly phase: ThreadPhase;
  /** The status line from the copy rules ("Draft ready — send?", "Sent 10:45, waiting", …). */
  readonly line: string;
  /** Verbatim: our approved text, or the place's reply exactly as received. */
  readonly body: string | null;
  /** When the desk sends an approved message ("The desk sends it between 07:00 and 23:00 SGT"). */
  readonly note?: string | null;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly onSend?: () => void;
  readonly onShare?: () => void;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
    gap: t.space['10'],
  },
  quote: { borderLeftWidth: 3, borderLeftColor: t.color.divider, paddingLeft: t.space['10'] },
}));

export function VendorThreadCard(props: VendorThreadCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <Stack style={styles.card} testID={props.testID ?? `vendor-thread-${props.phase}`}>
      <Text variant="eyebrow" color={theme.semantic.text.secondary}>
        {props.vendor}
      </Text>
      <Text variant="rowTitle" testID="vendor-thread-line">
        {props.line}
      </Text>
      {props.body ? (
        <View style={styles.quote}>
          <Text variant="body">{props.body}</Text>
        </View>
      ) : null}
      {props.note ? (
        <Text variant="caption" color={theme.semantic.text.secondary}>
          {props.note}
        </Text>
      ) : null}
      {props.phase === 'draft' && props.onSend ? (
        <Row gap="12" align="center">
          <View style={{ flex: 1 }}>
            <PillButton
              size="sm"
              label={t({ id: 'suppliers.vendor.send', message: 'Send' })}
              onPress={props.onSend}
              loading={props.busy ?? false}
              testID="vendor-thread-send"
            />
          </View>
        </Row>
      ) : null}
      {props.phase === 'self_send' && props.onShare ? (
        <PillButton
          size="sm"
          tone="green"
          label={t({ id: 'suppliers.vendor.share', message: 'Send it on WhatsApp' })}
          onPress={props.onShare}
          testID="vendor-thread-share"
        />
      ) : null}
      {props.error ? (
        <Text variant="caption" color={theme.semantic.state.urgent}>
          {props.error}
        </Text>
      ) : null}
    </Stack>
  );
}
