/**
 * The trip's messages to places, as a premium sheet: one white card per place with the truthful
 * status line from the copy rules ("Draft ready — send?", "Sent 10:45, waiting", "{vendor}
 * replied: …"), the exact text or reply, and Send or Send it on WhatsApp when it waits on the
 * traveller. Nothing yet: the guide's empty state.
 */
import type { VendorThreadView } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { guideCritterKind } from '@/features/trip';
import { Button, EmptyState, LoadingCritter, Text, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import type { SupplierApi } from '../../supplier/data/api';
import { useVendorThread, useVendorThreads } from '../../supplier/use-vendor-messages';
import { ErrorLine } from './SupplierParts';
import { Quote } from './VendorDraftPremium';

function ThreadCard({ thread }: { readonly thread: VendorThreadView }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const card = useVendorThread(thread);
  return (
    <View
      testID={card.testID}
      style={[
        styles.card,
        {
          borderRadius: th.radius.card,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
          gap: th.space.gap10,
        },
      ]}
    >
      <Text variant="badge" tone="muted">
        {card.vendor}
      </Text>
      <Text variant="rowTitle" testID="vendor-thread-line">
        {card.line}
      </Text>
      {card.body ? <Quote text={card.body} /> : null}
      {card.note ? (
        <Text variant="captionMuted" tone="muted">
          {card.note}
        </Text>
      ) : null}
      {card.phase === 'draft' && card.onSend ? (
        <Button
          label={t({ id: 'suppliers.vendor.send', message: 'Send' })}
          size="small"
          loading={card.busy ?? false}
          onPress={card.onSend}
          testID="vendor-thread-send"
        />
      ) : null}
      {card.phase === 'self_send' && card.onShare ? (
        <Button
          label={t({ id: 'suppliers.vendor.share', message: 'Send it on WhatsApp' })}
          size="small"
          variant="secondary"
          icon="send"
          onPress={card.onShare}
          testID="vendor-thread-share"
        />
      ) : null}
      {card.error ? <ErrorLine text={card.error} /> : null}
    </View>
  );
}

export function VendorMessagesPremium({
  tripId,
  api,
}: {
  readonly tripId: string;
  readonly api?: SupplierApi;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { load, guide } = useVendorThreads(tripId, api);
  return (
    <SheetScreen
      title={t({ id: 'suppliers.vendor.listTitle', message: 'Messages to places' })}
      cancelLabel={t({ id: 'suppliers.premium.close', message: 'Close' })}
      testID="vendor-messages-sheet"
    >
      <View style={[styles.body, { gap: th.space.gap10 }]}>
        {load.kind === 'loading' ? (
          <LoadingCritter
            label={t({ id: 'suppliers.vendor.loading', message: 'Loading your messages' })}
          />
        ) : load.kind !== 'ready' ? (
          <Text variant="body" tone="inkSecondary" testID="vendor-threads-unavailable">
            {load.kind === 'offline'
              ? t({
                  id: 'suppliers.vendor.listOffline',
                  message: 'Messages to places need signal to load.',
                })
              : t({
                  id: 'suppliers.vendor.listError',
                  message: 'Messages didn’t load. Try again in a moment.',
                })}
          </Text>
        ) : load.threads.length === 0 ? (
          <View style={styles.empty} testID="vendor-threads-empty">
            <EmptyState
              title={t({ id: 'suppliers.vendor.emptyTitle', message: 'No messages to places yet' })}
              line={t({
                id: 'suppliers.vendor.empty',
                message: 'When you ask a place something, the text and their reply show here.',
              })}
              critter={{ kind: guideCritterKind(guide.id), name: guide.name }}
              check={false}
            />
          </View>
        ) : (
          <View style={{ gap: th.space.gap10 }} testID="vendor-threads">
            {load.threads.map((thread) => (
              <ThreadCard key={thread.thread_id} thread={thread} />
            ))}
          </View>
        )}
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 4, paddingBottom: 32 },
  card: { padding: 16 },
  empty: { paddingTop: 24 },
});
