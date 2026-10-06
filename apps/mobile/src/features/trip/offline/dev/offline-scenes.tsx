/**
 * Lab scenes for the offline card (3k-4) on top of Batur, the reconnect as the acks land, a
 * partly saved day, a day never saved, weak signal, a conflict, the queued-item sheet, and
 * Settings > Offline (3n-2), with every handler a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { t } from '@lingui/core/macro';
import { useState, type ReactNode } from 'react';

import type { RejectedCommand } from '@/data/status/use-rejected-commands';
import { useLocale } from '@/lib/i18n/use-locale';

import { StorageSettingsView } from '../../bundle/storage-settings';
import type { SavedDay } from '../../bundle/bundle-manager';
import { dayEyebrow } from '../../day-of/day-of-copy';
import type { DayItemRow } from '../../hub/data/queries';
import { stillWorksLines } from '../offline-copy';
import type { SignalChip } from '../offline-card';
import { OfflinePage } from '../offline-screen';
import type { OfflineViewProps } from '../offline-view';
import { QueuedItemSheet } from '../queued-item-sheet';
import type { SendsLine } from '../sends-list';

const noop = () => undefined;
const done = () => Promise.resolve('done' as const);

const CHAT = {
  id: 'chat.queued.message',
  message: '“{preview}” to the crew chat',
  values: { preview: 'we made it!!' },
};

const SENDS: readonly SendsLine[] = [
  {
    opId: 'o1',
    summary: {
      id: 'trip.dayOf.queued.added',
      message: 'Pack: {label}',
      values: { label: 'Headlamp' },
    },
    sent: false,
    tickIndex: 0,
  },
  {
    opId: 'o2',
    summary: {
      id: 'chat.queued.message',
      message: '“{preview}” to the crew chat',
      values: { preview: 'we made it!!' },
    },
    sent: false,
    tickIndex: 0,
  },
  {
    opId: 'o3',
    summary: { id: 'vote.queued.ballot', message: 'Your vote' },
    sent: false,
    tickIndex: 0,
  },
];

const AT = '2026-10-14T19:02:00Z';
const FIRST: DayItemRow = {
  id: 'i1',
  stable_id: 'i1',
  starts_at: '2026-10-15T01:00:00Z',
  ends_at: null,
  tz: 'Asia/Makassar',
  attendee_ids: null,
  booking_id: null,
  category: 'transfer',
  notes: null,
  status: 'confirmed',
  poi_name: 'Pickup with Ketut',
  day_no: 4,
};
const DAY: SavedDay = {
  tripId: 't',
  localDate: '2026-10-15',
  version: 3,
  builtAt: AT,
  assets: [
    {
      kind: 'attachment',
      key: 'k1',
      label: 'Hot spring tickets for 09:30',
      uri: 'file:///t1',
      savedAt: AT,
    },
    { kind: 'phrase_audio', key: 'k2', label: 'Phrase cards', uri: 'file:///p1', savedAt: AT },
    { kind: 'map_region', key: 'k3', label: 'Trail map', uri: 'file:///m1', savedAt: AT },
  ],
  missing: [],
  places: [],
  fx: [],
  savedAt: AT,
};
const PARTIAL: SavedDay = {
  ...DAY,
  assets: DAY.assets.slice(0, 2),
  missing: [{ kind: 'map_region', label: 'Trail map', reason: 'space' }],
};

const CONFLICT: RejectedCommand = {
  opId: 'c1',
  cmd: 'cast_ballot',
  code: 'VOTE_CLOSED',
  messageKey: 'errors.VOTE_CLOSED',
  detail: null,
  summary: { id: 'vote.queued.ballot', message: 'Your vote' },
  rejectedAt: '2026-10-14T23:00:00Z',
};

function Offline({
  chip = 'offline',
  sends = SENDS,
  stillWorks = DAY,
  line = 'saved',
  conflicts = [],
  sheet,
}: {
  readonly chip?: SignalChip;
  readonly sends?: readonly SendsLine[];
  readonly stillWorks?: SavedDay | null;
  readonly line?: 'saved' | 'part' | 'none';
  readonly conflicts?: readonly RejectedCommand[];
  readonly sheet?: ReactNode;
}) {
  const locale = useLocale();
  const place = 'Batur';
  const time = '06:14';
  const savedAt = '03:02';
  const text =
    line === 'none'
      ? t({
          id: 'trip.offline.notSaved',
          message:
            "Today isn't saved to this phone yet. The plan still works; tickets and maps need signal.",
        })
      : line === 'part'
        ? t({
            id: 'trip.offline.partSaved',
            message: `${time}. Part of today was saved to your phone at ${savedAt}.`,
          })
        : t({
            id: 'trip.offline.saved',
            message: `${time}. Today was saved to your phone at ${savedAt}.`,
          });
  const view: OfflineViewProps = {
    card: {
      eyebrow: dayEyebrow('2026-10-15', 4, locale),
      headline: t({ id: 'trip.offline.headlineAt', message: `Offline at ${place}` }),
      line: text,
      chip,
      guide: 'tokek',
    },
    stillWorks: stillWorksLines({ day: stillWorks, first: FIRST, tz: 'Asia/Makassar', locale }),
    sends,
    conflicts,
    lastSynced: '03:02',
    onOpenPlan: noop,
    onOpenSend: noop,
    onDismissConflict: noop,
    sheet,
  };
  return <OfflinePage view={view} />;
}

/** The sheet closes for real (back, the grabber), so a second back leaves the scene. */
function QueuedScene() {
  const [open, setOpen] = useState(true);
  return (
    <Offline
      sheet={
        open ? (
          <QueuedItemSheet
            summary={CHAT}
            since="06:12"
            body="we made it!!"
            onCancel={done}
            onEdit={done}
            onClose={() => setOpen(false)}
          />
        ) : null
      }
    />
  );
}

export const OFFLINE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3k-4-offline': () => <Offline />,
  '3k-4-reconnecting': () => (
    <Offline
      chip="offline"
      sends={SENDS.map((line, index) => (index === 1 ? { ...line, sent: true } : line))}
    />
  ),
  '3k-4-back-online': () => (
    <Offline
      chip="back"
      sends={SENDS.map((line, index) => ({ ...line, sent: true, tickIndex: index }))}
    />
  ),
  '3k-4-partial': () => <Offline line="part" stillWorks={PARTIAL} />,
  '3k-4-not-saved': () => <Offline line="none" stillWorks={null} />,
  '3k-4-weak-signal': () => <Offline chip="weak" />,
  '3k-4-conflict': () => <Offline chip="back" sends={[]} conflicts={[CONFLICT]} />,
  '3k-4-queued-item': () => <QueuedScene />,
  '3n-2-offline-storage': () => (
    <StorageSettingsView
      trips={[
        {
          tripId: 't',
          name: 'Bali',
          kinds: ['attachment', 'map_region', 'phrase_audio'],
          bytes: 84 * 1024 * 1024,
        },
      ]}
      auto
      onAuto={noop}
      onSave={noop}
      onRemove={noop}
    />
  ),
};
