/**
 * Lab scenes for crew quests (3l-7) and the sticker shelf's detail sheet, over fixed data: a
 * generated quest day (faces, pips, an optional quest to join), the same day with one quest
 * finished and its reward revealed, the guide still writing, and offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Scaffold } from '@/ui/surface/Scaffold';

import { StickerDetailSheet } from '../../stickers/StickerDetailSheet';
import type { ShelfItem } from '../../stickers/sticker-model';
import { StickerShelfView } from '../../stickers/sticker-shelf-view';
import { buildQuestsModel, type QuestRow, type QuestsInput } from '../quests-model';
import { QuestsView } from '../quests-view';

const noop = () => undefined;
const NOW = new Date('2026-10-03T02:00:00Z');

function quest(slot: number, changes: Partial<QuestRow>): QuestRow {
  return {
    id: `q${slot}`,
    local_date: '2026-10-03',
    slot,
    template: 'log_expenses',
    params: '{}',
    target: 3,
    reward: '{"xp":90,"sticker":null,"form_id":null}',
    title: 'Quest',
    body: '',
    scope: 'crew',
    status: 'active',
    ends_at: '2026-10-03T17:00:00Z',
    reveal_at: null,
    ...changes,
  };
}

const DAY: readonly QuestRow[] = [
  quest(0, {
    template: 'copresence',
    params: '{"poi_id":"p1","by_time":"06:10"}',
    target: 6,
    reward: '{"xp":150,"sticker":null,"form_id":"f1"}',
    title: 'Sunrise squad',
    body: 'All six on the Son Tra lookout by 06:10.',
  }),
  quest(1, {
    params: '{"category":"food","n":5}',
    target: 5,
    reward: '{"xp":120,"sticker":null,"form_id":null}',
    title: 'Mi Quang crawl',
    body: 'Log five food stops today, noodles first.',
  }),
  quest(2, {
    template: 'settle_by',
    params: '{"by_time":"21:00"}',
    target: 1,
    reward: '{"xp":120,"sticker":"settled","form_id":null}',
    title: 'Zero debt',
    body: 'Settle every bill before 21:00 tonight.',
  }),
  quest(3, {
    template: 'befriend',
    params: '{"n":2}',
    target: 2,
    scope: 'optional',
    reward: '{"xp":80,"sticker":null,"form_id":null}',
    title: 'Local friends',
    body: 'Befriend two locals around the Dragon Bridge.',
  }),
];

const MEMBERS = ['Wren', 'Maya', 'Alex', 'Jordan', 'Dev', 'Rin'].map((name, index) => ({
  userId: `u${index}`,
  name,
  joinIndex: index,
}));

function input(changes: Partial<QuestsInput> = {}): QuestsInput {
  return {
    loaded: true,
    trip: { startDate: '2026-10-02', endDate: '2026-10-04', tz: 'Asia/Ho_Chi_Minh' },
    crewXp: 4540,
    quests: DAY,
    progress: [
      { quest_id: 'q0', value: 4, counted: '["u0","u1","u2","u3"]' },
      { quest_id: 'q1', value: 3, counted: null },
      { quest_id: 'q3', value: 1, counted: null },
    ],
    signups: [],
    members: MEMBERS,
    unsettled: ['u4', 'u5'],
    viewerId: 'u0',
    now: NOW,
    ...changes,
  };
}

function Quests({
  changes = {},
  offline = false,
  revealed = [],
}: {
  readonly changes?: Partial<QuestsInput>;
  readonly offline?: boolean;
  readonly revealed?: readonly string[];
}) {
  return (
    <QuestsView
      crewName="Da Nang Six"
      guide="chava"
      model={buildQuestsModel(input(changes))}
      offline={offline}
      reveals={new Map(revealed.map((id) => [id, 'static' as const]))}
      onSignUp={noop}
    />
  );
}

const SHELF: readonly ShelfItem[] = [
  {
    id: 's-settled',
    kind: 'settled',
    level: null,
    grantedAt: '2026-10-04T12:00:00Z',
    crewName: 'Da Nang Six',
    place: 'Da Nang',
    guide: 'tokek',
  },
  {
    id: 's-level',
    kind: 'crew_level',
    level: 2,
    grantedAt: '2026-10-03T09:00:00Z',
    crewName: 'Da Nang Six',
    place: 'Da Nang',
    guide: 'chava',
  },
];

function Detail({ item }: { readonly item: ShelfItem }) {
  return (
    <Scaffold variant="dark" testID="sticker-detail-scene">
      <View style={{ flex: 1, padding: 20, paddingTop: 64 }}>
        <StickerShelfView items={SHELF} onOpen={noop} />
      </View>
      <StickerDetailSheet item={item} />
    </Scaffold>
  );
}

const done = DAY.map((row) =>
  row.id === 'q1' ? { ...row, status: 'completed', reveal_at: '2026-10-03T01:59:00Z' } : row,
);

export const QUEST_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3l-7-quests': () => <Quests />,
  '3l-7-quest-done': () => (
    <Quests
      changes={{ quests: done, crewXp: 4660, signups: [{ quest_id: 'q3', user_id: 'u0' }] }}
      revealed={['q1']}
    />
  ),
  '3l-7-writing': () => <Quests changes={{ quests: [] }} />,
  '3l-7-offline': () => <Quests offline />,
  '3l-2-sticker-settled': () => <Detail item={SHELF[0] as ShelfItem} />,
  '3l-2-sticker-crew-level': () => <Detail item={SHELF[1] as ShelfItem} />,
};
