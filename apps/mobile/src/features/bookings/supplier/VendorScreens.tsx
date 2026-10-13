/**
 * Messages to places: writing one (request, then approve the exact text, or share it to the
 * traveller's own WhatsApp while the desk's number is off) and the trip's threads, read from
 * `GET /v1/trips/{id}/vendor-threads` (the desk's tables never sync).
 */
import type { VendorThreadView } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import { Stack } from '@/ui/layout/Stack';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { SupplierApi } from './data/api';
import {
  useVendorDraft,
  useVendorThread,
  useVendorThreads,
  type DraftParams,
} from './use-vendor-messages';
import { VendorDraftCard } from './VendorDraftCard';
import { VendorThreadCard, VendorThreadsEmpty } from './VendorThreadCard';

export type { DraftParams } from './use-vendor-messages';

export function VendorDraftScreen({ params }: { readonly params: DraftParams }) {
  return <VendorDraftCard {...useVendorDraft(params)} />;
}

export function VendorMessagesScreen({
  tripId,
  api,
}: {
  readonly tripId: string;
  readonly api?: SupplierApi;
}) {
  const theme = useTheme();
  const { t } = useLingui();
  const { load, guide } = useVendorThreads(tripId, api);
  if (load.kind === 'loading')
    return (
      <Skeleton
        preset="card"
        repeat={2}
        label={t({ id: 'suppliers.vendor.loading', message: 'Loading your messages' })}
      />
    );
  if (load.kind !== 'ready') {
    return (
      <Text
        variant="body"
        color={theme.semantic.text.secondary}
        testID="vendor-threads-unavailable"
      >
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
    );
  }
  if (load.threads.length === 0) return <VendorThreadsEmpty guide={guide} />;
  return (
    <Stack gap="12" testID="vendor-threads">
      {load.threads.map((thread) => (
        <ThreadCard key={thread.thread_id} thread={thread} />
      ))}
    </Stack>
  );
}

function ThreadCard({ thread }: { readonly thread: VendorThreadView }) {
  return <VendorThreadCard {...useVendorThread(thread)} />;
}
