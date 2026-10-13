/**
 * A message to a place, as a premium sheet: Cancel left and Send right; the exact text in the
 * field and the line that nothing leaves until it is sent. With the desk's WhatsApp number live,
 * Send approves this text and a person at the desk sends it; while it's off, the text goes to the
 * traveller's own WhatsApp. Edited text asks before the sheet goes.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Button, Text, TextField, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { useVendorDraft, type DraftParams } from '../../supplier/use-vendor-messages';
import { ErrorLine } from './SupplierParts';

export function VendorDraftPremium({ params }: { readonly params: DraftParams }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const draft = useVendorDraft(params);
  const { vendor, outcome } = draft;
  const editing = outcome.kind === 'editing';
  return (
    <SheetScreen
      title={t({ id: 'suppliers.vendor.draftTitle', message: 'Message to a place' })}
      cancelLabel={t({ id: 'suppliers.premium.cancel', message: 'Cancel' })}
      {...(editing
        ? {
            verb: {
              label: t({ id: 'suppliers.vendor.send', message: 'Send' }),
              disabled: draft.busy || draft.text.trim() === '',
              testID: 'vendor-draft-send',
              onPress: () => {
                draft.onSend();
                // The outcome shows in the sheet; it closes from Done.
                return false;
              },
            },
          }
        : {})}
      dirty={editing && draft.text !== params.text}
      discardPrompt={{
        title: t({ id: 'suppliers.premium.discardMessage', message: 'Discard this message?' }),
        message: t({ id: 'suppliers.premium.discardMessageLine', message: 'What you typed goes.' }),
        discard: t({ id: 'suppliers.premium.discardVerb', message: 'Discard' }),
        keep: t({ id: 'suppliers.premium.keepEditing', message: 'Keep editing' }),
      }}
      testID="vendor-draft-sheet"
    >
      <View style={[styles.body, { paddingHorizontal: th.space.gutter, gap: th.space.gap14 }]}>
        {outcome.kind === 'approved' ? (
          <View style={{ gap: th.space.gap14 }} testID="vendor-draft-approved">
            <Text variant="title">
              {t({
                id: 'suppliers.vendor.approved',
                message: 'Approved. The desk sends exactly this.',
              })}
            </Text>
            <Quote text={draft.text} />
            <Text variant="captionMuted" tone="muted">
              {outcome.note}
            </Text>
            <Button
              label={t({ id: 'suppliers.vendor.done', message: 'Done' })}
              onPress={draft.onDone}
            />
          </View>
        ) : outcome.kind === 'self_send' ? (
          <View style={{ gap: th.space.gap14 }} testID="vendor-draft-self-send">
            <Text variant="title">
              {t({ id: 'suppliers.vendor.selfTitle', message: 'Send it from your WhatsApp' })}
            </Text>
            <Text variant="body" tone="inkSecondary">
              {t({
                id: 'suppliers.vendor.selfBody',
                message: `WhatsApp opens with this text. Pick ${vendor}’s chat and send it. Their reply comes to you.`,
              })}
            </Text>
            <Quote text={draft.text} />
            <Button
              label={t({ id: 'suppliers.vendor.share', message: 'Send it on WhatsApp' })}
              icon="send"
              onPress={draft.onShare}
              testID="vendor-draft-share"
            />
            <Button
              label={t({ id: 'suppliers.vendor.done', message: 'Done' })}
              variant="secondary"
              onPress={draft.onDone}
            />
          </View>
        ) : (
          <View style={{ gap: th.space.gap12 }} testID="vendor-draft">
            <Text variant="label" tone="muted">
              {t({ id: 'suppliers.vendor.textLabel', message: `Message to ${vendor}` })}
            </Text>
            <TextField
              accessibilityLabel={t({
                id: 'suppliers.vendor.textLabel',
                message: `Message to ${vendor}`,
              })}
              value={draft.text}
              onChangeText={draft.onText}
              multiline
              testID="vendor-draft-text"
            />
            <Text variant="captionMuted" tone="muted">
              {t({
                id: 'suppliers.vendor.exactNote',
                message: `Nothing leaves until you send it, and ${vendor} gets exactly this text.`,
              })}
            </Text>
            {draft.error ? <ErrorLine text={draft.error} testID="vendor-draft-error" /> : null}
          </View>
        )}
      </View>
    </SheetScreen>
  );
}

/** The exact text, as a quote on the control fill. */
export function Quote({ text }: { readonly text: string }) {
  const th = usePremiumTheme();
  return (
    <View
      style={[styles.quote, { backgroundColor: th.color.control, borderRadius: th.radius.field }]}
    >
      <Text variant="body">{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 4, paddingBottom: 32 },
  quote: { padding: 14 },
});
