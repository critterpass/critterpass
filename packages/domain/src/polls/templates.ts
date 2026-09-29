/**
 * The poll pushes, in the guide's voice (N-01 a vote needs you, N-02 it closes soon, N-03 the
 * destination winner). Templates carry a catalog id and the source message; the worker renders
 * them in each recipient's language.
 */
export interface PollCopy {
  readonly id: string;
  readonly message: string;
}

export const VOTE_NEEDED_TITLE: PollCopy = {
  id: 'notifications.vote.needed.title',
  message: '{guide}, for {crew}',
};

export const VOTE_NEEDED_BODY: PollCopy = {
  id: 'notifications.vote.needed.body',
  message: '{asker} asked: {question} Tap an answer, I will count.',
};

export const VOTE_DESTINATION_BODY: PollCopy = {
  id: 'notifications.vote.destination.body',
  message: 'Where next? {count} places are on the board. Pick one.',
};

export const VOTE_FINAL_BODY: PollCopy = {
  id: 'notifications.vote.final.body',
  message: "It's {first} or {second} now. Your vote decides it.",
};

export const VOTE_CLOSING_BODY: Readonly<Record<'24h' | '2h', PollCopy>> = {
  '24h': {
    id: 'notifications.vote.closing.day',
    message: '{question} closes tomorrow and you have not voted yet.',
  },
  '2h': {
    id: 'notifications.vote.closing.hours',
    message: '{question} closes in two hours. One tap and you are in.',
  },
};

export const WINNER_TITLE: PollCopy = {
  id: 'notifications.vote.winner.title',
  message: '{guide}, for {crew}',
};

export const WINNER_BODY: PollCopy = {
  id: 'notifications.vote.winner.body',
  message: '{place} won {score}. Come see the reveal.',
};
