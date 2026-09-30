/**
 * Bookings lab scenes for adding a booking (3h-2) and its states: the design's two finds, reading,
 * couldn't read, already in the wallet, scan lines, the paste sheet and the mailbox sheet.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';

import { AddBookingView } from '../add/AddBookingView';
import { toCandidateView, type CandidateView } from '../candidates/candidate-model';
import type { CandidateRow } from '../data/queries';
import { MailboxConnectedView } from '../mailbox/MailboxConnectedScreen';
import { MailboxSheet } from '../mailbox/MailboxSheet';
import type { MailboxStatus } from '../mailbox/use-mailbox';
import { PasteSheet } from '../paste/PasteSheet';
import type { ScanState } from '../scan/use-booking-scan';
import { LAB_CANDIDATES, LAB_MEMBERS, LAB_TZ, LAB_UID, labCandidate } from './lab-fixtures';

const noop = () => undefined;
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
  options: { scan?: ScanState; connected?: boolean; assemble?: boolean } = {},
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
      onMailbox={noop}
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

const CONNECTION = {
  connection_id: 'm-1',
  provider: 'gmail' as const,
  status: 'active',
  last_scan_at: '2026-10-09T23:00:00Z',
};

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
};
