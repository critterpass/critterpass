/**
 * The four things a sent command can mean to the person, read from its result in one place.
 * Features import `commandOutcome` from `@/data/commands/outcome`; this layer-neutral copy exists so
 * the toast helper (`@/motion/island-toast`) reads results the same way.
 */

/**
 * - `done`: the server applied it.
 * - `queued`: saved on the phone and shown at once; it sends by itself (offline-capable commands).
 * - `needs-signal`: an online-only command could not reach the server, or the server failed in
 *   passing. Nothing changed; trying again when online can work.
 * - `refused`: the server said no (the result's `code` says why). Trying again will not help.
 */
export type CommandOutcome = 'done' | 'queued' | 'needs-signal' | 'refused';

/** The part of a command's result (`SendResult`) the outcome and its feedback are read from. */
export interface CommandResultLike {
  readonly kind: 'applied' | 'queued' | 'unavailable' | 'rejected';
  /** The wire error code of a refusal (docs/api-contracts.md §3). */
  readonly code?: string;
}

export function commandOutcome(result: CommandResultLike): CommandOutcome {
  switch (result.kind) {
    case 'applied':
      return 'done';
    case 'queued':
      return 'queued';
    case 'unavailable':
      return 'needs-signal';
    case 'rejected':
      return 'refused';
  }
}
