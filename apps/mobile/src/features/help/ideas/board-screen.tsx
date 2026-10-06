/**
 * The idea board over the phone: a tap votes or takes a vote back at once (through the offline
 * queue), the count and the votes left follow straight away, and a tap with no votes left says how
 * to free one instead of voting. A vote the server turns down is put back as it was. Suggesting
 * opens the sheet over the board: a look-alike gets the vote instead, or the idea is posted for
 * review and shows under NEW.
 */
import { generateUuidV7, IDEA_TITLE_MIN, IDEA_VOTE_BUDGET, ideaVoteMonth } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';

import {
  boardRows,
  hasMyVote,
  isVotable,
  shownCount,
  votesLeft,
  type BoardTab,
  type VoteOverrides,
} from './board';
import { BoardView, type BoardRow } from './BoardView';
import { submitIdeaCommand, unvoteIdeaCommand, voteIdeaCommand } from './commands';
import { SuggestSheet } from './SuggestSheet';
import { useBoard } from './use-board';
import { useSimilarIdeas } from './use-similar';

function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function BoardScreen({ suggestOpen = false }: { readonly suggestOpen?: boolean }) {
  const { t } = useLingui();
  const locale = useLocale();
  const board = useBoard();
  const vote = useCommand(voteIdeaCommand);
  const unvote = useCommand(unvoteIdeaCommand);
  const submit = useCommand(submitIdeaCommand);
  const [tab, setTab] = useState<BoardTab>('top');
  const [suggesting, setSuggesting] = useState(suggestOpen);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [posting, setPosting] = useState(false);
  const similar = useSimilarIdeas(suggesting ? title : '', locale);
  const [overrides, setOverrides] = useState<VoteOverrides>(new Map());
  const synced = useMemo(() => new Set(board.myVotes.map((v) => v.idea_id)), [board.myVotes]);
  const month = ideaVoteMonth(new Date(), deviceZone());
  const left = votesLeft(board.myVotes, overrides, month);

  const rows: BoardRow[] = boardRows(board.ideas, board.myPending, tab).map((idea) => ({
    id: idea.id,
    title: idea.title,
    status: idea.status,
    count: shownCount(idea, synced, overrides),
    voted: hasMyVote(idea.id, synced, overrides),
    votable: isVotable(idea.status),
    faces: board.faces.get(idea.id) ?? [],
    teamNote: idea.team_note,
  }));

  const setOverride = (id: string, voted: boolean | null) =>
    setOverrides((current) => {
      const next = new Map(current);
      if (voted === null) next.delete(id);
      else next.set(id, voted);
      return next;
    });

  /** Votes or takes the vote back; false when there was no vote left to give. */
  const onVote = (id: string): boolean => {
    const mine = hasMyVote(id, synced, overrides);
    if (!mine && left === 0) {
      toast.show({
        id: 'help-ideas-out-of-votes',
        title: t({
          id: 'help.ideas.outOfVotes',
          message: `You’ve used this month’s ${IDEA_VOTE_BUDGET} votes. Take one back to move it.`,
        }),
      });
      return false;
    }
    setOverride(id, !mine);
    const command = mine ? unvote : vote;
    void command.send({ idea_id: id }).then(
      (result) => {
        if (result.kind === 'rejected') setOverride(id, null);
      },
      () => setOverride(id, null),
    );
    return true;
  };

  const closeSuggest = () => {
    setSuggesting(false);
    setTitle('');
    setDescription('');
  };

  const voteForMatch = (id: string) => {
    const idea = board.ideas.find((one) => one.id === id);
    if (idea === undefined || !onVote(id)) return;
    const count = shownCount(idea, synced, new Map([...overrides, [id, true]]));
    closeSuggest();
    toast.show({
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast key, never copy.
      id: `help-ideas-voted-${id}`,
      title: t({
        id: 'help.ideas.votedFor',
        message: `Voted for ${idea.title}. That makes ${count}.`,
      }),
    });
  };

  const post = async () => {
    if (posting || title.trim().length < IDEA_TITLE_MIN) return;
    setPosting(true);
    try {
      const text = description.trim();
      await submit.send({
        id: generateUuidV7(),
        title: title.trim(),
        description: text === '' ? null : text,
        locale,
      });
      closeSuggest();
      setTab('new');
      toast.show({
        id: 'help-ideas-posted',
        title: t({
          id: 'help.ideas.posted',
          message: 'Posted under NEW. Tokek will tell you if it moves.',
        }),
      });
    } finally {
      setPosting(false);
    }
  };

  return (
    <>
      <BoardView
        tab={tab}
        onTab={setTab}
        rows={rows}
        votesLeft={left}
        unavailable={board.unavailable}
        loaded={board.loaded}
        onVote={(id) => void onVote(id)}
        onSuggest={() => setSuggesting(true)}
        onBack={() => router.back()}
      />
      {suggesting ? (
        <SuggestSheet
          title={title}
          onTitle={setTitle}
          description={description}
          onDescription={setDescription}
          matches={similar.map((idea) => ({
            id: idea.id,
            title: idea.title,
            status: idea.status,
            count: idea.votes_count,
            voted: hasMyVote(idea.id, synced, overrides),
          }))}
          posting={posting}
          onVote={voteForMatch}
          onPost={() => void post()}
          onClose={closeSuggest}
        />
      ) : null}
    </>
  );
}
