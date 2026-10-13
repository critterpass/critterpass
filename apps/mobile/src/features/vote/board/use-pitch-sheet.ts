/**
 * What the pitch sheet does, for both looks: the place search (cleared once a place is picked),
 * the picked place's streamed pitch, whether it is already on the open board, and "Add to the
 * vote": the candidate command, the toast (queued while a final is on, else the board's count),
 * an optional flight onto the board, then back.
 */
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';
import { toast } from '@/motion';
import { guideSticker } from '@/ui/avatar/guides';

import { useOpenDestinationPoll } from '../data/use-board';
import { useDestinationSearch } from '../data/use-destination-search';
import { useMyUid } from '../data/use-my-uid';
import { usePeople } from '../data/use-people';
import { usePitchStream } from '../data/use-pitch-stream';
import { usePoll } from '../data/use-poll';
import { addPollCandidateCommand } from '../data/vote-commands';
import { guideOr } from '../format';

export interface PickedPlace {
  readonly id: string;
  readonly name: string;
}

export interface PitchSheetInput {
  readonly crewId: string;
  readonly placeId?: string | undefined;
  /** The guide's sticker the toast shows. */
  readonly sticker: (guide: { readonly kind: string; readonly name: string }) => ReactNode;
  /** Flies the card onto the board before the sheet goes (the current look). */
  readonly fly?: (sticker: ReactNode) => Promise<void>;
}

export function usePitchSheet({ crewId, placeId, sticker: stickerFor, fly }: PitchSheetInput) {
  const { t } = useLingui();
  const me = useMyUid();
  const people = usePeople(crewId);
  const [query, setQueryText] = useState('');
  const [picked, setPicked] = useState<PickedPlace | null>(
    placeId === undefined ? null : { id: placeId, name: '' },
  );
  const search = useDestinationSearch(picked === null ? query : '');
  const { state, retry } = usePitchStream(picked === null ? null : { crewId, placeId: picked.id });
  const openPollId = useOpenDestinationPoll(crewId);
  const { poll } = usePoll(openPollId, me);
  const add = useCommand(addPollCandidateCommand);
  const name = state.sticker?.name ?? picked?.name ?? '';
  const onBoard = poll?.options.some((option) => option.refId === picked?.id) === true;

  const pick = (place: PickedPlace) => {
    setPicked(place);
    setQueryText(place.name);
  };
  const setQuery = (text: string) => {
    setQueryText(text);
    setPicked(null);
  };

  const addToVote = async () => {
    if (picked === null) return;
    if (onBoard) {
      goBackOr();
      return;
    }
    await add.send({
      crew_id: crewId,
      place_id: picked.id,
      ...(state.pitchId === null ? {} : { pitch_id: state.pitchId }),
    });
    const sticker = stickerFor(guideSticker(guideOr(state.sticker?.guide)));
    if (poll?.stage === 'final') {
      toast.show({
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
        id: `pitch-queued-${picked.id}`,
        sticker,
        title: t({
          id: 'vote.pitch.queuedToast',
          message: `${name} is pitched. It joins the vote after this one.`,
        }),
      });
    } else {
      const total = poll?.eligibleIds.length ?? people.size;
      const count = poll?.votedCount ?? 0;
      toast.show({
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
        id: `pitch-added-${picked.id}`,
        sticker,
        title: t({
          id: 'vote.pitch.addedToast',
          message: `${name}'s on the board. ${count} of ${total} have voted.`,
        }),
      });
      if (fly !== undefined) await fly(sticker);
    }
    goBackOr();
  };

  return {
    people,
    query,
    setQuery,
    picked,
    pick,
    search,
    /** Typing with nothing picked: the matches, a skeleton or a no-results line show. */
    searching: picked === null && query.trim().length > 0,
    state,
    retry,
    onBoard,
    adding: add.pending,
    addToVote,
    cta: onBoard
      ? t({ id: 'vote.pitch.onBoard', message: 'Already on the board' })
      : t({ id: 'vote.pitch.add', message: 'Add to the vote' }),
  };
}
