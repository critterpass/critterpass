/**
 * Fixed dates-step scenes over the Kyoto six: the designed best week (3c-3) and no-fit options
 * (3c-4), and every state around them. April 2027 counts are the render's.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture data and scene ids, never copy. */
import { useState } from 'react';

import { exitScene, type SetupScene } from '../scenes/types';
import { DEV, kyotoTrip, MAYA, SCENE_NOW, sceneFrame, WINSTON } from '../scenes/fixtures';
import { ASK, FULL, PARTIAL, summaries, whenModel } from './fixtures';
import { heatMonths, type WindowOption } from './model';
import { AskSheetView } from './ask-sheet';
import { WeekPicker } from './week-picker';
import { WhenView, type WhenModel } from './when-view';

const NOOP = {
  onSelect: () => undefined,
  onLock: () => undefined,
  onAsk: () => undefined,
  onPickWeek: () => undefined,
  onConnect: () => undefined,
  onMarkByHand: () => undefined,
};

function When({ m, me, offline }: { m: WhenModel; me?: string; offline?: boolean }) {
  const trip = kyotoTrip({ me: me ?? WINSTON });
  const [selected, setSelected] = useState(m.selectedId);
  return (
    <WhenView
      shell={sceneFrame(trip, 'when', { offline: offline === true })}
      model={{ ...m, selectedId: selected }}
      actions={{ ...NOOP, onSelect: setSelected }}
    />
  );
}

const noFit = (options: WindowOption[], extra: Partial<WhenModel> = {}) =>
  whenModel({
    mode: 'no_fit',
    best: null,
    months: heatMonths(summaries([4, 5, 6], 6)),
    synced: 6,
    options,
    selectedId: options.find((o) => o.isPick)?.id ?? options[0]?.id ?? null,
    ...extra,
  });

export const WHEN_SCENES: readonly SetupScene[] = [
  { name: '3c-3-when', render: () => <When m={whenModel({})} /> },
  { name: '3c-4-no-week-fits', render: () => <When m={noFit([PARTIAL, FULL, ASK])} /> },
  {
    name: 'when-member',
    render: () => (
      <When
        me={DEV}
        m={whenModel({ me: DEV, calendar: { status: 'needs_permission', lastSyncedAt: null } })}
      />
    ),
  },
  {
    name: 'when-empty',
    render: () => (
      <When
        m={whenModel({
          mode: 'empty',
          best: null,
          synced: 0,
          months: [],
          calendar: { status: 'needs_permission', lastSyncedAt: null },
        })}
      />
    ),
  },
  {
    name: 'when-one-synced',
    render: () => <When m={whenModel({ synced: 1 })} />,
  },
  {
    name: 'when-computing',
    render: () => <When m={whenModel({ mode: 'computing', best: null })} />,
  },
  {
    name: 'when-syncing',
    render: () => <When m={whenModel({ calendar: { status: 'syncing', lastSyncedAt: null } })} />,
  },
  {
    name: 'when-stale',
    render: () => (
      <When
        m={whenModel({
          calendar: { status: 'synced', lastSyncedAt: new Date(SCENE_NOW - 80 * 3_600_000) },
        })}
      />
    ),
  },
  {
    name: 'when-denied',
    render: () => <When m={whenModel({ calendar: { status: 'denied', lastSyncedAt: null } })} />,
  },
  {
    name: 'when-sync-error',
    render: () => <When m={whenModel({ calendar: { status: 'error', lastSyncedAt: null } })} />,
  },
  {
    name: 'when-ask-pending',
    render: () => <When m={noFit([PARTIAL, FULL, { ...ASK, askState: 'asked' }])} />,
  },
  {
    name: 'when-ask-declined',
    render: () => (
      <When
        m={noFit([
          PARTIAL,
          { ...FULL, isPick: true },
          { ...ASK, isPick: false, askState: 'not_movable' },
        ])}
      />
    ),
  },
  {
    name: 'when-ask-timeout',
    render: () => (
      <When
        m={noFit([
          { ...PARTIAL, isPick: true },
          FULL,
          { ...ASK, isPick: false, askState: 'timed_out' },
        ])}
      />
    ),
  },
  {
    name: 'when-two-blockers',
    render: () => (
      <When
        m={noFit([{ ...PARTIAL, freeCount: 4, missingIds: [DEV, MAYA], isPick: true }, FULL])}
      />
    ),
  },
  { name: 'when-offline', render: () => <When offline m={whenModel({})} /> },
  {
    name: 'when-lock-failed',
    render: () => <When m={whenModel({ failure: 'offline' })} />,
  },
  {
    name: 'when-week-picker',
    render: () => {
      const months = heatMonths(summaries([4]));
      return (
        <>
          <When m={whenModel({})} />
          <WeekPicker
            months={months}
            startMonth={0}
            total={6}
            lengthDays={8}
            busy={false}
            onLock={() => undefined}
            onDismiss={exitScene}
          />
        </>
      );
    },
  },
  {
    name: 'when-ask-sheet',
    render: () => (
      <>
        <When me={DEV} m={whenModel({ me: DEV })} />
        <AskSheetView
          place="Kyoto"
          guide="pon"
          organiser="Winston"
          sent={false}
          busy={false}
          onAnswer={() => undefined}
          onWords={() => undefined}
          onDismiss={exitScene}
        />
      </>
    ),
  },
  {
    name: 'when-ask-sheet-sent',
    render: () => (
      <>
        <When me={DEV} m={whenModel({ me: DEV })} />
        <AskSheetView
          place="Kyoto"
          guide="pon"
          organiser="Winston"
          sent
          busy={false}
          onAnswer={() => undefined}
          onWords={() => undefined}
          onDismiss={exitScene}
        />
      </>
    ),
  },
];
