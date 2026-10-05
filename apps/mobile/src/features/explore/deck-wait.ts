/**
 * What the swipe screen says while there are no cards to show yet. A deck takes the guide one to
 * two minutes to put together (30 places ranked and annotated), and a member who opened the screen
 * in that time used to see a blank placeholder with no word of how long. The cards also need their
 * places on the phone, which can lag a moment behind the deck. Past four minutes the deck is
 * treated as stuck and the person is offered a fresh start.
 */
export type DeckWait = 'building' | 'arriving' | 'stuck';

/** How long a deck usually takes, as the screen tells it. */
export const DECK_MINUTES = 2;
/** Past this the deck is not coming. */
export const DECK_STUCK_MS = 4 * 60_000;

export function deckWait(input: {
  /** When the session row was created; null while it has not synced. */
  readonly startedAt: string | null;
  /** Cards in the deck as synced. */
  readonly cards: number;
  readonly now: Date;
}): DeckWait {
  const started = input.startedAt === null ? Number.NaN : Date.parse(input.startedAt);
  const waited = Number.isNaN(started) ? 0 : input.now.getTime() - started;
  if (waited > DECK_STUCK_MS) return 'stuck';
  return input.cards > 0 ? 'arriving' : 'building';
}
