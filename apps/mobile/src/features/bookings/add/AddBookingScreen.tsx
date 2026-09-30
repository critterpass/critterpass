/**
 * Add a booking over synced rows: the crew's forward address, the member's own and the crew's
 * candidates (a paste or scan appears as "parsing" at once and assembles when it has been read),
 * ADD / IGNORE (resolving for every traveller), the paste sheet and the mailbox sheet. `start`
 * opens a channel straight away (the empty wallet's tiles, the Settings row).
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { toast } from '@/motion';

import {
  addPayload,
  ignorePayload,
  toCandidateView,
  type CandidateView,
} from '../candidates/candidate-model';
import { resolveCandidateCommand } from '../data/commands';
import { useLiveRows } from '../data/live-rows';
import {
  CANDIDATES_SQL,
  CANDIDATES_TABLES,
  FX_RUN_SQL,
  FX_TABLES,
  type CandidateRow,
  type FxRow,
} from '../data/queries';
import { useBookingsServices } from '../data/services';
import { useWalletContext } from '../data/use-wallet-context';
import { addByHandRoute, BOOKINGS_ROUTES } from '../routes';
import { useMailbox } from '../mailbox/use-mailbox';
import { useBookingScan } from '../scan/use-booking-scan';
import { AddBookingView } from './AddBookingView';
import type { ImportChannel } from './ImportTiles';
import { MailboxFlow } from './MailboxFlow';
import { PasteFlow } from './PasteFlow';

export function AddBookingScreen({ start }: { readonly start?: string | undefined }) {
  const context = useWalletContext();
  const services = useBookingsServices();
  const { t } = useLingui();
  const resolve = useCommand(resolveCandidateCommand);
  const tripId = context.trip?.id ?? null;
  const scan = useBookingScan(services.ocr, tripId);
  const rows = useLiveRows<CandidateRow>(
    CANDIDATES_SQL,
    context.uid === null ? null : [context.uid, context.crewId ?? '', tripId ?? ''],
    CANDIDATES_TABLES,
  );
  const mailbox = useMailbox(context.passPlus);
  const [sheet, setSheet] = useState<'paste' | 'mailbox' | null>(
    start === 'paste' || start === 'mailbox' ? start : null,
  );
  const [splits, setSplits] = useState<Record<string, boolean>>({});
  const [leaving, setLeaving] = useState<Record<string, 'add' | 'ignore'>>({});
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  // The card renders once with how it leaves, then unmounts so that exit animation runs.
  const leave = (id: string, how: 'add' | 'ignore') => {
    setLeaving((current) => ({ ...current, [id]: how }));
    requestAnimationFrame(() => setGone((current) => new Set([...current, id])));
  };
  const [assembling, setAssembling] = useState<ReadonlySet<string>>(new Set());
  const seenParsing = useRef(new Set<string>());
  const views = useMemo(
    () =>
      context.uid === null
        ? []
        : rows.rows
            .map((row) =>
              toCandidateView(row, context.members, context.travellerIds, context.uid ?? ''),
            )
            .filter((view): view is CandidateView => view !== null && !gone.has(view.id)),
    [rows.rows, context.members, context.travellerIds, context.uid, gone],
  );
  const fxCurrency = views.find((view) => view.booking?.price != null)?.booking?.price?.currency;
  const fx = useLiveRows<FxRow>(
    FX_RUN_SQL,
    fxCurrency === undefined ? null : [fxCurrency, context.crewCurrency],
    FX_TABLES,
  );

  // A candidate seen while it was being read assembles its fields when it arrives.
  useEffect(() => {
    const ready = views.filter(
      (view) => view.state !== 'parsing' && seenParsing.current.has(view.id),
    );
    for (const view of views) if (view.state === 'parsing') seenParsing.current.add(view.id);
    if (ready.length === 0) return;
    for (const view of ready) seenParsing.current.delete(view.id);
    setAssembling((current) => new Set([...current, ...ready.map((view) => view.id)]));
  }, [views]);

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || start !== 'scan') return;
    opened.current = true;
    void scan.scan();
  }, [start, scan]);

  const onChannel = (channel: ImportChannel) => {
    if (channel === 'paste') setSheet('paste');
    else if (channel === 'scan') void scan.scan();
    else if (context.inboundAddress !== null) {
      void services.copy(context.inboundAddress).then(() =>
        toast.show({
          id: 'bookings-address-copied',
          title: t({
            id: 'bookings.add.copiedToast',
            message: 'Forward any confirmation to that address.',
          }),
        }),
      );
    }
  };

  const onAdd = (id: string) => {
    const view = views.find((item) => item.id === id);
    if (view === undefined || tripId === null) return;
    leave(id, 'add');
    void resolve
      .send(
        addPayload(view, {
          tripId,
          split: splits[id] ?? view.canSplit,
          crewCurrency: context.crewCurrency,
          fx: fx.rows,
        }),
      )
      .then(() =>
        toast.show({
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast key, not copy
          id: `bookings-added-${id}`,
          title: t({ id: 'bookings.add.addedToast', message: 'In the wallet.' }),
        }),
      );
  };

  const onIgnore = (id: string) => {
    const view = views.find((item) => item.id === id);
    if (view === undefined) return;
    leave(id, 'ignore');
    void resolve.send(ignorePayload(view));
  };

  return (
    <>
      <AddBookingView
        address={context.inboundAddress}
        candidates={views}
        splits={splits}
        assembling={assembling}
        leaving={leaving}
        scan={scan.state}
        mailboxConnected={mailbox.status.kind === 'connected'}
        noTrip={context.status === 'no_trip'}
        tz={context.trip?.tz ?? undefined}
        onBack={() => (router.canGoBack() ? router.back() : router.replace(BOOKINGS_ROUTES.wallet))}
        onChannel={onChannel}
        onCopy={(address) => services.copy(address)}
        onSplit={(id, next) => setSplits((current) => ({ ...current, [id]: next }))}
        onAdd={onAdd}
        onIgnore={onIgnore}
        onByHand={(id) => {
          const view = views.find((item) => item.id === id);
          const booking = view?.booking ?? null;
          router.push(
            addByHandRoute(booking === null ? {} : { kind: booking.kind, title: booking.title }),
          );
          if (view !== undefined) onIgnore(id);
        }}
        onMailbox={() => setSheet('mailbox')}
      />
      {sheet === 'paste' ? <PasteFlow tripId={tripId} onDone={() => setSheet(null)} /> : null}
      {sheet === 'mailbox' ? (
        <MailboxFlow
          status={mailbox.status}
          address={context.inboundAddress}
          onChanged={mailbox.reload}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  );
}
