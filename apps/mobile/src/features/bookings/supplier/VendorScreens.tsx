/**
 * Messages to places: writing one (request, then approve the exact text, or share it to the
 * traveller's own WhatsApp while the desk's number is off) and the trip's threads, read from
 * `GET /v1/trips/{id}/vendor-threads` (the desk's tables never sync).
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and error codes. */
import {
  ALL_PARTNERS_OFF,
  generateUuidV7,
  supplierCopy,
  whatsappShareLink,
  type ApproveVendorMessageResult,
  type RequestVendorMessageResult,
  type VendorIntent,
  type VendorThreadView,
} from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { Stack } from '@/ui/layout/Stack';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { clock } from '../format';
import { useSupplierCopy } from './copy';
import { deviceSupplierApi, type SupplierApi } from './data/api';
import { approveVendorMessageCommand, requestVendorMessageCommand } from './data/commands';
import { VendorDraftCard, type DraftOutcome } from './VendorDraftCard';
import { threadPhase } from './thread-phase';
import { VendorThreadCard, VendorThreadsEmpty } from './VendorThreadCard';
import { useTripGuide } from './data/use-trip-guide';

export interface DraftParams {
  readonly tripId: string;
  readonly vendorKind: 'provider' | 'poi';
  readonly vendorId: string;
  readonly vendorName: string;
  readonly intent: VendorIntent;
  readonly text: string;
}

function useDeskNote() {
  const { t } = useLingui();
  return (hours: ApproveVendorMessageResult['desk_hours']) => {
    const open = hours.open;
    const close = hours.close;
    const tz = hours.tz;
    return t({
      id: 'suppliers.vendor.deskHours',
      message: `The desk sends messages between ${open} and ${close} (${tz}).`,
    });
  };
}

export function VendorDraftScreen({ params }: { readonly params: DraftParams }) {
  const { t } = useLingui();
  const deskNote = useDeskNote();
  const request = useCommand(requestVendorMessageCommand);
  const approve = useCommand(approveVendorMessageCommand);
  const [text, setText] = useState(params.text);
  const [outcome, setOutcome] = useState<DraftOutcome>({ kind: 'editing' });
  const [share, setShare] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offline = t({
    id: 'suppliers.vendor.needsSignal',
    message: 'Sending needs signal. Your text is still here.',
  });

  const send = async () => {
    setError(null);
    const exact = text.trim();
    const asked = await request.send({
      draft_id: generateUuidV7(),
      trip_id: params.tripId,
      vendor: { kind: params.vendorKind, id: params.vendorId },
      vendor_name: params.vendorName,
      intent: params.intent,
      draft_text: exact,
    });
    if (asked.kind !== 'applied') {
      setError(
        asked.kind === 'unavailable'
          ? offline
          : t({ id: 'suppliers.vendor.failed', message: 'That didn’t go through. Try again.' }),
      );
      return;
    }
    const answer = asked.result as RequestVendorMessageResult;
    if (answer.channel === 'self_send') {
      setShare(answer.share?.wa_link ?? whatsappShareLink(exact));
      setOutcome({ kind: 'self_send' });
      return;
    }
    const approved = await approve.send({ draft_id: answer.draft_id, text: exact });
    if (approved.kind === 'applied') {
      setOutcome({
        kind: 'approved',
        note: deskNote((approved.result as ApproveVendorMessageResult).desk_hours),
      });
    } else {
      setError(
        approved.kind === 'unavailable'
          ? offline
          : t({ id: 'suppliers.vendor.failed', message: 'That didn’t go through. Try again.' }),
      );
    }
  };

  return (
    <VendorDraftCard
      vendor={params.vendorName}
      text={text}
      onText={setText}
      outcome={outcome}
      busy={request.pending || approve.pending}
      error={error}
      onSend={() => void send()}
      onShare={() => {
        if (share) void Linking.openURL(share).catch(() => undefined);
      }}
      onDone={() => router.back()}
    />
  );
}

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly threads: readonly VendorThreadView[] }
  | { readonly kind: 'offline' }
  | { readonly kind: 'error' };

export function VendorMessagesScreen({
  tripId,
  api = deviceSupplierApi,
}: {
  readonly tripId: string;
  readonly api?: SupplierApi;
}) {
  const theme = useTheme();
  const { t } = useLingui();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const guide = useTripGuide(tripId);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void api.vendorThreads(tripId).then((outcome) => {
        if (!live) return;
        setLoad(
          outcome.kind === 'ok'
            ? { kind: 'ready', threads: outcome.value }
            : { kind: outcome.kind === 'offline' ? 'offline' : 'error' },
        );
      });
      return () => {
        live = false;
      };
    }, [api, tripId]),
  );
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
  const { t } = useLingui();
  const locale = useLocale();
  const render = useSupplierCopy();
  const deskNote = useDeskNote();
  const approve = useCommand(approveVendorMessageCommand);
  const [state, setState] = useState<{ approvedNote: string | null; error: string | null }>({
    approvedNote: null,
    error: null,
  });
  const { phase, outbound, reply } = threadPhase(thread);
  const vendor = thread.vendor_name;
  const effective = state.approvedNote !== null ? 'approved' : phase;
  const line =
    effective === 'replied'
      ? render(
          supplierCopy(
            { action: 'vendor', state: 'replied', vendor, reply: reply?.body ?? '' },
            ALL_PARTNERS_OFF,
          ),
        )
      : effective === 'draft' || effective === 'self_send'
        ? render(supplierCopy({ action: 'vendor', state: 'draft_ready', vendor }, ALL_PARTNERS_OFF))
        : effective === 'approved'
          ? t({ id: 'suppliers.vendor.approvedLine', message: 'Approved · the desk sends it' })
          : effective === 'failed'
            ? t({
                id: 'suppliers.vendor.failedLine',
                message: 'It didn’t reach them on WhatsApp. The desk will tell you what next.',
              })
            : render(
                supplierCopy(
                  {
                    action: 'vendor',
                    state: 'sent',
                    vendor,
                    time: outbound ? clock(locale, outbound.at) : '',
                  },
                  ALL_PARTNERS_OFF,
                ),
              );
  return (
    <VendorThreadCard
      vendor={vendor}
      phase={effective}
      line={line}
      body={effective === 'replied' ? null : (outbound?.body ?? null)}
      note={state.approvedNote}
      busy={approve.pending}
      error={state.error}
      onSend={() => {
        if (outbound === null) return;
        void approve.send({ draft_id: outbound.id, text: outbound.body }).then((result) =>
          setState(
            result.kind === 'applied'
              ? {
                  approvedNote: deskNote((result.result as ApproveVendorMessageResult).desk_hours),
                  error: null,
                }
              : {
                  approvedNote: null,
                  error: t({
                    id: 'suppliers.vendor.failed',
                    message: 'That didn’t go through. Try again.',
                  }),
                },
          ),
        );
      }}
      onShare={() => {
        if (outbound) void Linking.openURL(whatsappShareLink(outbound.body)).catch(() => undefined);
      }}
      testID={`vendor-thread-${thread.thread_id}`}
    />
  );
}
