/**
 * Client-side command specs: whether a command may wait in the offline queue, and how the queued
 * and "didn't go through" lists describe it ("12 sunrise photos → crew album", "Your vote: Nusa
 * Penida"). Features declare one spec per command next to the code that sends it:
 *
 *   export const castBallot = defineClientCommand({
 *     name: 'cast_ballot',
 *     offline: true,
 *     summarize: (p: { option: string }) => msg({ id: 'polls.queued.vote', message: `Your vote: ${p.option}` }),
 *   });
 *
 * A command without `summarize` is listed under its own name.
 */
import type { RegisteredCommandName } from '@cp/domain';
import type { MessageDescriptor } from '@lingui/core';

export interface ClientCommandSpec<Payload> {
  /** The server command name (`verb_noun`): only a name the api registers compiles. */
  readonly name: RegisteredCommandName;
  /** Offline-capable: queued and uploaded through `/sync/upload`; otherwise sent to `/v1/cmd`. */
  readonly offline: boolean;
  readonly summarize?: (payload: Payload) => MessageDescriptor;
}

export function defineClientCommand<Payload>(
  spec: ClientCommandSpec<Payload>,
): ClientCommandSpec<Payload> {
  return spec;
}

/** The summary stored with a queued op, or null when the command has no summarizer. */
export function summarize<Payload>(
  spec: ClientCommandSpec<Payload>,
  payload: Payload,
): MessageDescriptor | null {
  return spec.summarize?.(payload) ?? null;
}

/** A stored summary, or the command name when there is none (or it is unreadable). */
export function summaryOrName(cmd: string, stored: string | null): MessageDescriptor {
  if (stored !== null) {
    try {
      const parsed = JSON.parse(stored) as Partial<MessageDescriptor> | null;
      if (parsed !== null && typeof parsed.id === 'string') return parsed as MessageDescriptor;
    } catch {
      // fall through to the command name
    }
  }
  return { id: cmd, message: cmd };
}
