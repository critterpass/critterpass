/**
 * Bookings lab scenes for adding a booking (3h-2) and its states: the design's two finds, reading,
 * couldn't read, already in the wallet, scan lines, the paste sheet, the mailbox sheet and the
 * link-code sheet (waiting for a code, a wrong one, linked).
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';

import { AddBookingView } from '../add/AddBookingView';
import { toCandidateView, type CandidateView } from '../candidates/candidate-model';
import type { CandidateRow } from '../data/queries';
import { LinkCodeSheet } from '../link-code/LinkCodeSheet';
import type { LinkCodeState } from '../link-code/link-code-model';
import { MailboxConnectedView } from '../mailbox/MailboxConnectedScreen';
import { MailboxSheet } from '../mailbox/MailboxSheet';
import type { MailboxStatus } from '../mailbox/use-mailbox';
import { PasteSheet } from '../paste/PasteSheet';
import type { ScanState } from '../scan/use-booking-scan';
import {
  extracted,
  LAB_CANDIDATES,
  LAB_MEMBERS,
  LAB_TZ,
  LAB_UID,
  labCandidate,
} from './lab-fixtures';

const noop = () => undefined;

const PASTED_FLIGHT = {
  user_id: LAB_UID,
  source: 'paste',
  crew_visible: 0,
  extracted: extracted({
    kind: 'flight',
    title: '9G 956 · SGN → DAD',
    starts_at: '2026-10-02T00:05:00.000Z',
    ends_at: '2026-10-02T01:30:00.000Z',
    tz: 'Asia/Ho_Chi_Minh',
    segments: [
      {
        carrier: '9G',
        flight_no: '956',
        dep_airport: 'SGN',
        arr_airport: 'DAD',
        sched_dep_at: '2026-10-02T00:05:00.000Z',
        sched_arr_at: '2026-10-02T01:30:00.000Z',
      },
    ],
    extracted_by: 'schedule',
  }),
} as const;
const copy = () => Promise.resolve();
const ADDRESS = 'bali-six@in.critterpass.app';

function views(rows: readonly CandidateRow[]): CandidateView[] {
  return rows
    .map((row) =>
      toCandidateView(
        row,
        LAB_MEMBERS,
        LAB_MEMBERS.map((m) => m.userId),
        LAB_UID,
      ),
    )
    .filter((view): view is CandidateView => view !== null);
}

function add(
  rows: readonly CandidateRow[],
  options: { scan?: ScanState; connected?: boolean; assemble?: boolean; held?: number } = {},
): ReactNode {
  const list = views(rows);
  return (
    <AddBookingView
      address={ADDRESS}
      candidates={list}
      splits={{}}
      assembling={new Set(options.assemble === true ? list.map((view) => view.id) : [])}
      leaving={{}}
      scan={options.scan ?? 'idle'}
      mailboxConnected={options.connected ?? true}
      noTrip={false}
      tz={LAB_TZ}
      onBack={noop}
      onChannel={noop}
      onCopy={copy}
      onSplit={noop}
      onAdd={noop}
      onIgnore={noop}
      onByHand={noop}
      onTypeIn={noop}
      onMailbox={noop}
      onLinkCode={noop}
      heldMail={options.held ?? 0}
    />
  );
}

/**
 * The add screen with a sheet over it. Closing the sheet unmounts it (as the screen does), so
 * the next Android back leaves the scene instead of reaching a hidden sheet.
 */
function WithSheet({ sheet }: { readonly sheet: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      {add(LAB_CANDIDATES)}
      {open ? sheet(() => setOpen(false)) : null}
    </>
  );
}

function mailbox(status: MailboxStatus, paywall = true): ReactNode {
  return (
    <WithSheet
      sheet={(close) => (
        <MailboxSheet
          status={status}
          address={ADDRESS}
          surfaceToCrew
          busy={false}
          error={false}
          onPaywall={paywall ? noop : null}
          onSurface={noop}
          onConnect={noop}
          onDisconnect={noop}
          onCopy={copy}
          onClose={close}
        />
      )}
    />
  );
}

function linkCode(state: LinkCodeState, code = ''): ReactNode {
  return (
    <WithSheet
      sheet={(close) => (
        // No keyboard in the lab: the screenshot flows leave a scene with two backs.
        <LinkCodeSheet
          state={state}
          onLink={noop}
          onClose={close}
          initialCode={code}
          autoFocus={false}
        />
      )}
    />
  );
}

const CONNECTION = {
  connection_id: 'm-1',
  provider: 'gmail' as const,
  status: 'active',
  last_scan_at: '2026-10-09T23:00:00Z',
};

/** A whole confirmation email, as an airline sends it: far more than the field shows at once. */
const LONG_CONFIRMATION = [
  'Your booking is confirmed. Booking reference K7Q2PX.',
  'Passenger: WINSTON TAN. Frequent flyer 8812 334 901.',
  'Flight SQ 938, Singapore (SIN) Terminal 3 to Denpasar Bali (DPS), 22 October 2026.',
  'Departs 09:10, arrives 11:55. Economy Lite, seat 42A. Baggage: 25 kg checked, 7 kg cabin.',
  'Flight SQ 943, Denpasar Bali (DPS) to Singapore (SIN), 29 October 2026.',
  'Departs 12:55, arrives 15:35. Economy Lite, seat 41C.',
  'Check in online from 48 hours before departure. Fare rules: changes from SGD 75, no refund.',
  'Total paid: SGD 412.60, charged to the card ending 4471.',
].join('\n');

export const ADD_SCENES: Readonly<Record<string, () => ReactNode>> = {
  add: () => add(LAB_CANDIDATES),
  'add-assemble': () => add(LAB_CANDIDATES.slice(0, 1), { assemble: true }),
  'add-empty': () => add([], { connected: false }),
  'add-reading': () =>
    add(
      [
        labCandidate('c-new', { user_id: LAB_UID, source: 'paste', status: 'parsing' }),
        ...LAB_CANDIDATES,
      ],
      {
        scan: 'sent',
      },
    ),
  'add-failed': () =>
    add([
      labCandidate('c-failed', {
        user_id: LAB_UID,
        source: 'scan',
        status: 'failed',
        failure_reason: 'unreadable',
      }),
      labCandidate('c-dup', {
        status: 'duplicate',
        extracted: LAB_CANDIDATES[0]?.extracted ?? null,
      }),
    ]),
  'add-scan-denied': () => add(LAB_CANDIDATES, { scan: 'denied' }),
  'add-held-mail': () => add([], { held: 1 }),
  // A flight number pasted on its own: found in the schedule, and not found.
  'add-flight-found': () => add([labCandidate('c-9g956', PASTED_FLIGHT)]),
  'add-flight-not-found': () =>
    add([
      labCandidate('c-9g999', {
        user_id: LAB_UID,
        source: 'paste',
        status: 'failed',
        failure_reason: 'flight_not_found',
      }),
    ]),
  paste: () => (
    <WithSheet
      sheet={(close) => (
        <PasteSheet
          sending={false}
          error={null}
          readClipboard={() => Promise.resolve('')}
          onSend={noop}
          onClose={close}
        />
      )}
    />
  ),
  'paste-long': () => (
    <WithSheet
      sheet={(close) => (
        <PasteSheet
          sending={false}
          error={null}
          readClipboard={() => Promise.resolve('')}
          onSend={noop}
          onClose={close}
          initialText={LONG_CONFIRMATION}
        />
      )}
    />
  ),
  'paste-offline': () => (
    <WithSheet
      sheet={(close) => (
        <PasteSheet
          sending={false}
          error="offline"
          readClipboard={() => Promise.resolve('')}
          onSend={noop}
          onClose={close}
        />
      )}
    />
  ),
  'mailbox-soon': () => mailbox({ kind: 'soon' }),
  'mailbox-locked': () => mailbox({ kind: 'locked' }),
  'mailbox-choose': () => mailbox({ kind: 'choose', providers: ['gmail', 'microsoft'] }),
  'mailbox-connected': () => mailbox({ kind: 'connected', connection: CONNECTION }),
  'mailbox-done': () => <MailboxConnectedView outcome="connected" onDone={noop} />,
  'link-code': () => linkCode({ kind: 'idle' }),
  'link-code-wrong': () => linkCode({ kind: 'wrong' }, '482913'),
  'link-code-linked': () => linkCode({ kind: 'linked', released: 3 }),
};
