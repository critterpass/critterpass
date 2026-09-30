/**
 * A message to a place (3e-2, 3k-5, 3k-9, truthful): the exact text before it leaves ("Draft ready
 * — send?"), then "Sent {time}, waiting", then the place's reply verbatim ("{vendor} replied: …").
 * Nothing says a table is held or a pickup moved until the place itself says so.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import type { GuideId } from '@/ui/people/GuideLine';
import { EmptyState } from '@/ui/states/EmptyState';
import { Sticker } from '@/ui/sticker/Sticker';

import type { ThreadPhase } from './thread-phase';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

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

/** No messages to places yet: the guide's empty state. */
export function VendorThreadsEmpty({
  guide,
}: {
  readonly guide: { readonly id: GuideId; readonly name: string };
}) {
  const { t } = useLingui();
  const sticker = GUIDE_STICKERS[guide.id];
  return (
    <View testID="vendor-threads-empty">
      <EmptyState
        guide={guide.id}
        guideName={guide.name}
        sticker={<Sticker kind={sticker.kind} name={sticker.name} pose="sleep" size={120} />}
        title={t({ id: 'suppliers.vendor.emptyTitle', message: 'No messages to places yet' })}
        line={t({
          id: 'suppliers.vendor.empty',
          message: 'When you ask a place something, the text and their reply show here.',
        })}
      />
    </View>
  );
}
