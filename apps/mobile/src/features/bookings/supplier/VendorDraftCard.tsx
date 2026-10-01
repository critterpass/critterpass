/**
 * Writing a message to a place: the exact text, editable, and what happens on SEND. With the
 * desk's WhatsApp number live, SEND approves this text and a person at the desk sends it; while
 * it's off, SEND hands the text to the traveller's own WhatsApp (`wa.me`) to pick the place's chat.
 */
import { useLingui } from '@lingui/react/macro';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export type DraftOutcome =
  | { readonly kind: 'editing' }
  | { readonly kind: 'approved'; readonly note: string }
  | { readonly kind: 'self_send' };

export interface VendorDraftCardProps {
  readonly vendor: string;
  readonly text: string;
  readonly onText: (text: string) => void;
  readonly outcome: DraftOutcome;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSend: () => void;
  readonly onShare: () => void;
  readonly onDone: () => void;
}

export function VendorDraftCard(props: VendorDraftCardProps) {
  const theme = useTheme();
  const { t } = useLingui();
  const vendor = props.vendor;
  if (props.outcome.kind === 'approved') {
    return (
      <Stack gap="14" testID="vendor-draft-approved">
        <Text variant="h3">
          {t({
            id: 'suppliers.vendor.approved',
            message: 'Approved. The desk sends exactly this.',
          })}
        </Text>
        <Text variant="body">{props.text}</Text>
        <Text variant="caption" color={theme.semantic.text.secondary}>
          {props.outcome.note}
        </Text>
        <PillButton
          label={t({ id: 'suppliers.vendor.done', message: 'Done' })}
          onPress={props.onDone}
        />
      </Stack>
    );
  }
  if (props.outcome.kind === 'self_send') {
    return (
      <Stack gap="14" testID="vendor-draft-self-send">
        <Text variant="h3">
          {t({ id: 'suppliers.vendor.selfTitle', message: 'Send it from your WhatsApp' })}
        </Text>
        <Text variant="body">
          {t({
            id: 'suppliers.vendor.selfBody',
            message: `WhatsApp opens with this text. Pick ${vendor}’s chat and send it. Their reply comes to you.`,
          })}
        </Text>
        <Text variant="body">{props.text}</Text>
        <PillButton
          tone="green"
          label={t({ id: 'suppliers.vendor.share', message: 'Send it on WhatsApp' })}
          onPress={props.onShare}
          testID="vendor-draft-share"
        />
        <PillButton
          variant="secondary"
          label={t({ id: 'suppliers.vendor.done', message: 'Done' })}
          onPress={props.onDone}
        />
      </Stack>
    );
  }
  return (
    <Stack gap="14" testID="vendor-draft">
      <TextField
        label={t({ id: 'suppliers.vendor.textLabel', message: `Message to ${vendor}` })}
        value={props.text}
        onChangeText={props.onText}
        multiline
        testID="vendor-draft-text"
      />
      <Text variant="caption" color={theme.semantic.text.secondary}>
        {t({
          id: 'suppliers.vendor.exactNote',
          message: `Nothing leaves until you send it, and ${vendor} gets exactly this text.`,
        })}
      </Text>
      <PillButton
        label={t({ id: 'suppliers.vendor.send', message: 'Send' })}
        onPress={props.onSend}
        loading={props.busy}
        disabled={props.text.trim() === ''}
        testID="vendor-draft-send"
      />
      {props.error ? (
        <Text variant="caption" color={theme.semantic.state.urgent} testID="vendor-draft-error">
          {props.error}
        </Text>
      ) : null}
    </Stack>
  );
}
