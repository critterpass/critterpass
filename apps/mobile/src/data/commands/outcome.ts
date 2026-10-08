/**
 * One reading of a command's result (`SendResult` from `useCommand(...).send`):
 * `commandOutcome(result)` is `'done' | 'queued' | 'needs-signal' | 'refused'`.
 *
 * Use it wherever a screen branches on what a send did, instead of checking `result.kind` by hand
 * or ignoring the result. To also tell the person (the feedback cue and one toast), call
 * `useCommandFeedback().report(result, copy)` from `@/motion/island-toast`, which returns the same
 * outcome.
 */
export { commandOutcome } from '@/lib/commands/outcome';
export type { CommandOutcome } from '@/lib/commands/outcome';
