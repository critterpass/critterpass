/**
 * Telling the person what a sent command did: `useCommandFeedback().report(result, copy)` plays
 * the feedback cue, shows one toast and returns the outcome (`@/data/commands/outcome`) so the
 * caller can branch (leave the screen on `done`, stay on anything else).
 *
 * Use it after every `send` whose result the screen does not already draw in place:
 *
 *   const outcome = report(await save.send(payload), { done: t(...), refused: { CODE: t(...) } });
 *   if (outcome === 'done') goBackOr(parent);
 *
 * - `done` shows `copy.done` (nothing when omitted: the screen's own change is the feedback).
 * - `queued` does the same when `copy.offlineCapable` is set, and is silent otherwise.
 * - `needs-signal` shows "Needs signal. Try again when you're back online." (or `copy.needsSignal`).
 * - `refused` shows the caller's line for that error code, else "That didn't go through.".
 */
import { useLingui } from '@lingui/react/macro';
import { useCallback } from 'react';

import { commandOutcome } from '@/lib/commands/outcome';
import type { CommandOutcome, CommandResultLike } from '@/lib/commands/outcome';

import { impact } from '../feedback';
import { toastQueue } from './queue';

export interface CommandFeedbackCopy {
  /** The toast once it went through ("Saved"). Omit when the screen itself shows the change. */
  readonly done?: string | undefined;
  /** An offline-capable action: a send kept on the phone to go by itself counts as done. */
  readonly offlineCapable?: boolean | undefined;
  /** In place of the default "Needs signal" line, when the screen can name the step to retry. */
  readonly needsSignal?: string | undefined;
  /** What a refusal says: one line for any refusal, or a line per wire error code. */
  readonly refused?: string | Readonly<Record<string, string>> | undefined;
  /** Toast key, so two actions' toasts never drop each other. @default 'command' */
  readonly id?: string | undefined;
}

export interface CommandFeedback {
  readonly report: (result: CommandResultLike, copy?: CommandFeedbackCopy) => CommandOutcome;
}

/** The caller's line for a refusal's error code, when it gave one. */
function refusalLine(
  refused: CommandFeedbackCopy['refused'],
  code: string | undefined,
): string | undefined {
  if (typeof refused === 'string') return refused;
  return code === undefined ? undefined : refused?.[code];
}

export function useCommandFeedback(): CommandFeedback {
  const { t } = useLingui();
  const report = useCallback(
    (result: CommandResultLike, copy: CommandFeedbackCopy = {}): CommandOutcome => {
      const outcome = commandOutcome(result);
      const id = `${copy.id ?? 'command'}-${outcome}`;
      const went = outcome === 'done' || (outcome === 'queued' && copy.offlineCapable === true);
      if (went && copy.done !== undefined) {
        impact('success');
        toastQueue.show({ id, title: copy.done });
      } else if (outcome === 'needs-signal') {
        impact('warning');
        toastQueue.show({
          id,
          title:
            copy.needsSignal ??
            t({
              id: 'motion.commandFeedback.needsSignal',
              message: 'Needs signal. Try again when you’re back online.',
            }),
        });
      } else if (outcome === 'refused') {
        impact('error');
        toastQueue.show({
          id,
          title:
            refusalLine(copy.refused, result.code) ??
            t({ id: 'motion.commandFeedback.refused', message: 'That didn’t go through.' }),
        });
      }
      return outcome;
    },
    [t],
  );
  return { report };
}
