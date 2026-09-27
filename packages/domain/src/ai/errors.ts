/**
 * Gateway error taxonomy sent as the SSE `error{code}` event (docs/api-contracts.md §5.3) and
 * thrown by `packages/ai`. `QUOTA_EXHAUSTED` is the same wire code as the command-level one in
 * ../errors.ts; the others exist only on AI surfaces. Each code has a persona-voiced fallback copy
 * key the client renders in the guide's voice, never a raw provider message.
 */
import { z } from 'zod';

export const AI_ERROR_CODES = [
  'AI_UNAVAILABLE',
  'AI_REFUSED',
  'QUOTA_EXHAUSTED',
  'FAIR_USE_SLOWDOWN',
  'TOOL_UNAVAILABLE',
] as const;
export const aiErrorCodeSchema = z.enum(AI_ERROR_CODES);
export type AiErrorCode = z.infer<typeof aiErrorCodeSchema>;

export interface AiErrorSpec {
  /** Whether the client may offer "try again" on the same input. */
  readonly retryable: boolean;
  /** i18n key of the persona-voiced fallback line shown instead of an answer. */
  readonly fallbackCopyKey: string;
}

export const AI_ERRORS: Readonly<Record<AiErrorCode, AiErrorSpec>> = {
  AI_UNAVAILABLE: { retryable: true, fallbackCopyKey: 'guide.fallback.unavailable' },
  AI_REFUSED: { retryable: false, fallbackCopyKey: 'guide.fallback.refused' },
  QUOTA_EXHAUSTED: { retryable: false, fallbackCopyKey: 'guide.fallback.quota_exhausted' },
  FAIR_USE_SLOWDOWN: { retryable: true, fallbackCopyKey: 'guide.fallback.busy' },
  TOOL_UNAVAILABLE: { retryable: false, fallbackCopyKey: 'guide.fallback.cannot_check' },
};

/** SSE `error` event payload. */
export const aiErrorEventSchema = z.object({
  code: aiErrorCodeSchema,
  retryable: z.boolean(),
});
export type AiErrorEvent = z.infer<typeof aiErrorEventSchema>;
