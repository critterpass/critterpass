/**
 * The crew chat timeline from the local database: synced messages in server `seq` order (the newest
 * window first, older windows on demand), then this device's unacknowledged sends in the order they
 * were queued, then sends the server refused (RETRY / DELETE). Order never reads a device clock or
 * a UUIDv7, so a phone set an hour off still sees the crew's order. Messages from crewmates the
 * user muted are left out; their own messages never are.
 *
 * The phone keeps a crew's latest 1,000 messages. Once the member has scrolled past the oldest of
 * them, earlier pages come from the api (`older-messages.ts`) and sit above the phone's own rows
 * until the chat closes.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import {
  CHAT_SYNC_WINDOW,
  deviceChatHistoryApi,
  fetchOlder,
  forgetOlder,
  keepOlder,
  localReactions,
  readOlder,
  useOlderMessages,
  type ChatHistoryApi,
  type OlderReaction,
  type OlderStatus,
} from './older-messages';
import {
  EMPTY_TIMELINE,
  keepTimeline,
  leftWindow,
  loadTimeline,
  MESSAGE_WINDOW,
  movedApart,
  type Timeline,
} from './timeline';

export { keepTimeline, loadTimeline, MESSAGE_WINDOW, type Timeline } from './timeline';

/** A window that holds every message the phone has, once older pages are read from the api. */
const EVERY_LOCAL_MESSAGE = Number.MAX_SAFE_INTEGER - 1;

const TABLES = ['messages', 'users', 'commands', 'rejected_commands', 'user_settings'];
/** Read as well once the rows that can leave the phone are on screen, for the reactions they take. */
const TABLES_WITH_REACTIONS = [...TABLES, 'message_reactions'];
const NO_REACTIONS: readonly OlderReaction[] = [];

export interface MessagesState extends Omit<Timeline, 'firstSeq' | 'muted'> {
  /** False until the first local read lands (the skeleton shows meanwhile). */
  readonly loaded: boolean;
  /** The newest seq at the first read: later messages arrived while the chat was open. */
  readonly openedSeq: number | null;
  /** How many synced messages the loaded window holds at most. */
  readonly window: number;
  /** Where the page above the oldest message stands: on its way, or not read (RETRY). */
  readonly olderStatus: OlderStatus;
  readonly loadOlder: () => void;
  readonly retryOlder: () => void;
}
export function useMessages(
  crewId: string,
  me: string | null,
  history: ChatHistoryApi = deviceChatHistoryApi,
): MessagesState {
  const { db } = useLocalFirst();
  const older = useOlderMessages(crewId);
  // What was fetched lives as long as the screen does.
  useEffect(() => () => forgetOlder(crewId), [crewId]);
  const shown = useRef({ timeline: EMPTY_TIMELINE, reactions: NO_REACTIONS });
  const [limit, setLimit] = useState(MESSAGE_WINDOW);
  const [state, setState] = useState<{
    timeline: Timeline;
    loaded: boolean;
    openedSeq: number | null;
  }>({ timeline: EMPTY_TIMELINE, loaded: false, openedSeq: null });

  useEffect(() => {
    if (me === null) return undefined;
    const controller = new AbortController();
    // A window this deep reaches the oldest rows the phone holds: the ones a new message pushes out.
    const leaving = limit >= CHAT_SYNC_WINDOW;
    const read = async () => {
      // Reactions are read before the rows, so a row found here still had the reactions found here.
      const reactions = leaving
        ? await localReactions(db, crewId).catch(() => NO_REACTIONS)
        : NO_REACTIONS;
      return { timeline: await loadTimeline(db, crewId, me, limit), reactions };
    };
    const load = () =>
      read().then(
        ({ timeline, reactions }) => {
          if (controller.signal.aborted) return;
          // With older pages on screen or on their way, a row leaving the phone's window stays in
          // the timeline: the page being fetched ends just below it.
          const held = readOlder(crewId);
          if (movedApart(shown.current.timeline, timeline)) {
            // What is held no longer joins on to the phone's rows: scrolling up reads on from
            // the new oldest message instead of showing the two as one run.
            forgetOlder(crewId);
          } else if (held.messages.length > 0 || held.status === 'loading') {
            const gone = leftWindow(shown.current.timeline, timeline);
            if (gone.length > 0) keepOlder(crewId, gone, shown.current.reactions);
          }
          shown.current = { timeline, reactions };
          setState((previous) => {
            const kept = keepTimeline(previous.timeline, timeline);
            // A reload that changed nothing on screen re-renders nothing.
            if (previous.loaded && kept === previous.timeline) return previous;
            return {
              timeline: kept,
              loaded: true,
              openedSeq: previous.openedSeq ?? timeline.lastSeq,
            };
          });
        },
        () => undefined,
      );
    void load();
    db.onChange(
      { onChange: () => load() },
      {
        tables: leaving ? TABLES_WITH_REACTIONS : TABLES,
        throttleMs: 30,
        signal: controller.signal,
      },
    );
    return () => controller.abort();
  }, [db, crewId, me, limit]);

  const local = state.timeline;
  // The oldest message in hand: the top of the fetched pages, else of the phone's own rows.
  const oldestSeq = older.messages[0]?.seq ?? local.firstSeq;
  // `seq` starts at 1 and has no gaps, so anything above 1 at the top means earlier messages exist.
  const olderOnServer = !local.hasOlder && !older.reachedStart && oldestSeq > 1;

  const fetchPage = useCallback(() => {
    if (!olderOnServer) return;
    // From here on the window holds every row the phone has: pages join on to its oldest one.
    setLimit(EVERY_LOCAL_MESSAGE);
    void fetchOlder(db, crewId, oldestSeq, history);
  }, [db, crewId, history, olderOnServer, oldestSeq]);

  const loadOlder = useCallback(() => {
    if (local.hasOlder) setLimit((current) => current + MESSAGE_WINDOW);
    // A page that could not be read waits for RETRY: reaching the top again does not hammer it.
    else if (older.status !== 'failed') fetchPage();
  }, [local.hasOlder, older.status, fetchPage]);

  const messages = useMemo(() => {
    const floor = local.firstSeq > 0 ? local.firstSeq : Number.POSITIVE_INFINITY;
    const above = older.messages.filter(
      (message) =>
        (message.seq ?? 0) < floor &&
        (message.senderId === me || !local.muted.has(message.senderId ?? '')),
    );
    return above.length === 0 ? local.messages : [...above, ...local.messages];
  }, [older.messages, local, me]);

  return useMemo(
    () => ({
      messages,
      hasOlder: local.hasOlder || olderOnServer,
      lastSeq: local.lastSeq,
      loaded: state.loaded,
      openedSeq: state.openedSeq,
      window: limit,
      olderStatus: older.status,
      loadOlder,
      retryOlder: fetchPage,
    }),
    [messages, local, olderOnServer, state, limit, older.status, loadOlder, fetchPage],
  );
}
