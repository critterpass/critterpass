/**
 * The idea board's lab scenes: the board (3p-4) on each tab, out of votes, and Suggest an idea
 * (3p-5) with one look-alike, several, and none. Votes and tabs work in place; nothing is sent.
 * Closing the sheet leaves the scene, as back does on the others.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture ideas and names, never shipped copy. */
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';

import { boardRows, isVotable, type BoardIdea, type BoardTab } from '../ideas/board';
import { BoardView } from '../ideas/BoardView';
import { SuggestSheet, type SuggestMatch } from '../ideas/SuggestSheet';

const noop = () => undefined;

const idea = (
  id: string,
  title: string,
  status: BoardIdea['status'],
  votes: number,
  created: string,
  teamNote: string | null = null,
): BoardIdea => ({
  id,
  title,
  description: null,
  status,
  team_note: teamNote,
  votes_count: votes,
  status_changed_at: created,
  created_at: created,
});

const IDEAS: readonly BoardIdea[] = [
  idea('packing', 'Packing lists per crew', 'planned', 412, '2026-08-01T00:00:00Z'),
  idea('receipts', 'Split receipts by item', 'building', 356, '2026-08-10T00:00:00Z'),
  idea('watch', 'Leave-by alarms on the watch', 'open', 288, '2026-09-20T00:00:00Z'),
  idea(
    'marrakech',
    'A guide for Marrakech',
    'planned',
    241,
    '2026-09-02T00:00:00Z',
    'I know a guy',
  ),
  idea('voice', 'Offline voice for the guide', 'open', 198, '2026-10-01T00:00:00Z'),
  idea('maps', 'Offline maps for every city', 'shipped', 520, '2026-07-01T00:00:00Z'),
];

const MINE: readonly BoardIdea[] = [
  idea('mine', 'Pack weight per bag', 'pending_review', 0, '2026-10-05T00:00:00Z'),
];

const FACES: Readonly<Record<string, readonly string[]>> = { packing: ['Maya', 'Jordan'] };

function Board({
  start = 'top',
  voted = ['packing', 'receipts', 'marrakech'],
  left = 3,
  sheet,
}: {
  readonly start?: BoardTab;
  readonly voted?: readonly string[];
  readonly left?: number;
  readonly sheet?: readonly SuggestMatch[];
}) {
  const [tab, setTab] = useState<BoardTab>(start);
  const [mine, setMine] = useState<ReadonlySet<string>>(new Set(voted));
  const [title, setTitle] = useState(sheet === undefined ? '' : 'Shared packing list');
  const [description, setDescription] = useState('');
  const spent = mine.size - voted.length;
  const rows = boardRows(IDEAS, MINE, tab).map((one) => ({
    id: one.id,
    title: one.title,
    status: one.status,
    count: one.votes_count + (mine.has(one.id) && !voted.includes(one.id) ? 1 : 0),
    voted: mine.has(one.id),
    votable: isVotable(one.status),
    faces: FACES[one.id] ?? [],
    teamNote: one.team_note,
  }));
  return (
    <>
      <BoardView
        tab={tab}
        onTab={setTab}
        rows={rows}
        votesLeft={Math.max(0, left - spent)}
        unavailable={false}
        loaded
        onVote={(id) =>
          setMine((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else if (left - spent > 0) next.add(id);
            return next;
          })
        }
        onSuggest={noop}
        onBack={noop}
      />
      {sheet === undefined ? null : (
        <SuggestSheet
          title={title}
          onTitle={setTitle}
          description={description}
          onDescription={setDescription}
          matches={sheet}
          posting={false}
          onVote={noop}
          onPost={noop}
          onClose={() => router.back()}
        />
      )}
    </>
  );
}

const PACKING: SuggestMatch = {
  id: 'packing',
  title: 'Packing lists per crew',
  status: 'planned',
  count: 412,
  voted: false,
};

export const IDEA_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3p-4-board': () => <Board />,
  'board-new': () => <Board start="new" />,
  'board-shipped': () => <Board start="shipped" />,
  'board-no-votes': () => <Board left={0} />,
  '3p-5-suggest': () => <Board sheet={[PACKING]} />,
  'suggest-many': () => (
    <Board
      sheet={[
        PACKING,
        {
          id: 'receipts',
          title: 'Split receipts by item',
          status: 'building',
          count: 356,
          voted: false,
        },
      ]}
    />
  ),
  'suggest-no-match': () => <Board sheet={[]} />,
};
