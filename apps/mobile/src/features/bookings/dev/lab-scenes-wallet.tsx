/**
 * Bookings lab scenes for the wallet (3h-1), its flight states, the archive, a booking's detail
 * and form, and the boarding pass, over the Bali Six fixtures with every handler a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { BoardingPassView } from '../boarding-pass/BoardingPassView';
import { toWalletBooking, splitWallet, stackOrder, type WalletBooking } from '../data/model';
import type { SegmentRow } from '../data/queries';
import { BookingDetailView } from '../detail/BookingDetailView';
import { BookingFormView } from '../detail/BookingFormView';
import { draftOf, emptyDraft, problemsOf } from '../detail/form-model';
import { FlightCard } from '../flight-card/FlightCard';
import { clock, dayDate, price } from '../format';
import { flightView } from '../flight-card/flight-model';
import { useChipLabel, useSourceLine } from '../flight-card/labels';
import { ArchiveView } from '../stack/ArchiveView';
import { BookingBody } from '../stack/BookingBody';
import { useDeckMeta } from '../stack/deck-meta';
import { WalletView } from '../stack/WalletView';
import {
  LAB_BOOKINGS,
  LAB_FLIGHT,
  LAB_MEMBERS,
  LAB_NOW,
  LAB_PASS,
  LAB_SEGMENTS,
  LAB_TZ,
  LAB_UID,
  labSegment,
} from './lab-fixtures';

const noop = () => undefined;

function bookings(segments: readonly SegmentRow[] = LAB_SEGMENTS): WalletBooking[] {
  return LAB_BOOKINGS.map((row) => toWalletBooking(row, segments, LAB_UID));
}

function flightBody(leg: Partial<SegmentRow>, hasPass = true, gateChanged = false): ReactNode {
  const segments = [labSegment('s-winston', LAB_UID, 'b-flight', leg), ...LAB_SEGMENTS.slice(1)];
  const booking = toWalletBooking(LAB_FLIGHT, segments, LAB_UID);
  const view = flightView(booking, segments, { gateChanged });
  return view === null ? null : (
    <FlightCard
      view={view}
      tz={LAB_TZ}
      coTravellers={['Maya', 'Alex']}
      hasPass={hasPass}
      mine
      onPass={noop}
      testID="bookings-flight"
    />
  );
}

function WalletScene({
  openId,
  body,
  banner = true,
  offline = 9,
  archive = 0,
}: {
  readonly openId: string;
  readonly body: ReactNode;
  readonly banner?: boolean;
  readonly offline?: number;
  readonly archive?: number;
}) {
  const meta = useDeckMeta();
  const { upcoming } = splitWallet(bookings(), LAB_NOW);
  const { closed, open } = stackOrder(upcoming, openId);
  // The design lays the closed cards trek, boat, villa above the open flight.
  const order = ['b-trek', 'b-boat', 'b-villa', 'b-flight'];
  const sorted = [...closed].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return (
    <WalletView
      state="ready"
      offlineCount={offline}
      closed={sorted.map((booking) => ({
        key: booking.id,
        title: booking.title,
        meta: meta(booking, LAB_TZ),
        tone: booking.tone,
        icon: booking.icon,
      }))}
      open={open === null ? null : { key: open.id, tone: open.tone }}
      openBody={body}
      banner={banner ? { count: 2, member: 'Alex' } : null}
      archiveCount={archive}
      onSelect={noop}
      onOpenDetail={noop}
      onReview={noop}
      onAdd={noop}
      onChannel={noop}
      onArchive={noop}
    />
  );
}

function wallet(
  openId: string,
  body: ReactNode,
  options: { banner?: boolean; offline?: number; archive?: number } = {},
): ReactNode {
  return <WalletScene openId={openId} body={body} {...options} />;
}

function DetailScene({ id }: { readonly id: string }) {
  const locale = useLocale();
  const chip = useChipLabel();
  const source = useSourceLine();
  const booking = bookings().find((item) => item.id === id);
  if (booking === undefined) return null;
  const flight = booking.kind === 'flight';
  const start = booking.segments[0]?.sched_dep_at ?? booking.startsAt;
  return (
    <BookingDetailView
      booking={booking}
      tz={LAB_TZ}
      when={`${dayDate(locale, start, LAB_TZ)} ${clock(locale, start, LAB_TZ)}`}
      travellers={format.list(locale, flight ? ['Winston'] : LAB_MEMBERS.map((m) => m.name))}
      price={flight ? null : price(locale, 22800, 'USD')}
      status={flight ? `${chip('on_time', 0)} · ${source('AeroAPI', '09:12')}` : null}
      canReportLanded={false}
      docs={flight ? [] : [{ id: 'a1', label: 'Voucher.pdf', uri: 'file:///a1' }]}
      hasPass={flight}
      onPass={noop}
      onDoc={noop}
      onShare={noop}
      onLanded={noop}
      onEdit={noop}
      onDelete={noop}
    />
  );
}

function PassScene() {
  const { t } = useLingui();
  return (
    <BoardingPassView
      title="SQ 938 · SIN → DPS"
      subtitle={dayDate(useLocale(), '2026-10-12T09:05:00+08:00', LAB_TZ)}
      payload={LAB_PASS}
      fields={[
        { key: 'seat', label: t({ id: 'bookings.flight.seat', message: 'Seat' }), value: '34A' },
        { key: 'gate', label: t({ id: 'bookings.flight.gate', message: 'Gate' }), value: 'B7' },
        { key: 'ref', label: t({ id: 'bookings.card.ref', message: 'Ref' }), value: 'K7PQ2Z' },
      ]}
      onClose={noop}
    />
  );
}

export const WALLET_SCENES: Readonly<Record<string, () => ReactNode>> = {
  wallet: () => wallet('b-flight', flightBody({})),
  'wallet-delayed': () =>
    wallet(
      'b-flight',
      flightBody({ status: 'delayed', delay_min: 25, est_dep_at: '2026-10-12T09:30:00+08:00' }),
      { banner: false },
    ),
  'wallet-gate-change': () =>
    wallet('b-flight', flightBody({ gate: 'C2' }, true, true), { banner: false }),
  'wallet-boarding': () =>
    wallet('b-flight', flightBody({ status: 'boarding' }), { banner: false }),
  'wallet-cancelled': () =>
    wallet('b-flight', flightBody({ status: 'cancelled' }), { banner: false }),
  'wallet-landed': () =>
    wallet('b-flight', flightBody({ status: 'landed', act_arr_at: '2026-10-12T11:32:00+08:00' }), {
      banner: false,
    }),
  'wallet-estimate': () =>
    wallet(
      'b-flight',
      flightBody(
        { status: 'scheduled', status_source: 'schedule', gate: null, boarding_estimated: 1 },
        false,
      ),
      { banner: false, offline: 3 },
    ),
  'wallet-stay': () =>
    wallet(
      'b-trek',
      (() => {
        const trek = bookings().find((item) => item.id === 'b-trek');
        return trek === undefined ? null : (
          <BookingBody
            booking={trek}
            tz={LAB_TZ}
            hasPass={false}
            onPass={noop}
            testID="bookings-body"
          />
        );
      })(),
      { banner: false, archive: 2 },
    ),
  'wallet-empty': () => (
    <WalletView
      state="empty"
      offlineCount={0}
      closed={[]}
      open={null}
      openBody={null}
      banner={null}
      archiveCount={0}
      onSelect={noop}
      onOpenDetail={noop}
      onReview={noop}
      onAdd={noop}
      onChannel={noop}
      onArchive={noop}
    />
  ),
  'wallet-loading': () => (
    <WalletView
      state="loading"
      offlineCount={0}
      closed={[]}
      open={null}
      openBody={null}
      banner={null}
      archiveCount={0}
      onSelect={noop}
      onOpenDetail={noop}
      onReview={noop}
      onAdd={noop}
      onChannel={noop}
      onArchive={noop}
    />
  ),
  archive: () => (
    <ArchiveView
      past={splitWallet(bookings(), Date.parse('2026-10-18T12:00:00+08:00')).past}
      tz={LAB_TZ}
      onOpen={noop}
    />
  ),
  'detail-flight': () => <DetailScene id="b-flight" />,
  'detail-activity': () => <DetailScene id="b-trek" />,
  edit: () => {
    const trek = bookings().find((item) => item.id === 'b-trek');
    if (trek === undefined) return null;
    const draft = draftOf(trek, LAB_TZ);
    return (
      <BookingFormView
        mode="edit"
        draft={draft}
        problems={[]}
        showProblems={false}
        saving={false}
        zone={{ city: 'Makassar', offset: 'GMT+8' }}
        onChange={noop}
        onSave={noop}
      />
    );
  },
  'add-by-hand': () => {
    const draft = { ...emptyDraft('flight'), date: '2026-10-12', flight: 'SQ 93' };
    return (
      <BookingFormView
        mode="add"
        draft={draft}
        problems={problemsOf(draft, LAB_TZ)}
        showProblems
        saving={false}
        zone={{ city: 'Makassar', offset: 'GMT+8' }}
        onChange={noop}
        onSave={noop}
      />
    );
  },
  pass: () => <PassScene />,
  'pass-missing': () => (
    <BoardingPassView
      title="SQ 938 · SIN → DPS"
      subtitle="Mon 12 Oct"
      payload={null}
      fields={[]}
      onClose={noop}
    />
  ),
};
