/**
 * Guide-written lines in a reader's language: one model call per batch of lines, every reply
 * checked line by line before anything is kept (./validate.ts). A decline or an unreadable reply
 * keeps nothing; a failed call throws, so the caller's job retries.
 */
import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import { buildTranslateRequest, TRANSLATE_ROUTE, type TranslatePromptInput } from './prompt';
import { TRANSLATE_BATCH_LINES, translateReplySchema } from './schema';
import { validateTranslateReply, type TranslateRejection } from './validate';

export * from './prompt';
export * from './schema';
export * from './validate';

export interface TranslateResult {
  /** Line id → the translation to store; a line that is absent keeps its source text. */
  readonly accepted: ReadonlyMap<string, string>;
  readonly rejected: readonly {
    readonly id: string;
    readonly reason: TranslateRejection | 'declined' | 'unparseable';
  }[];
  /** Model calls made. */
  readonly calls: number;
}

export async function translateGuideLines(
  gateway: Pick<Gateway, 'callModel'>,
  input: TranslatePromptInput,
  context: UsageContext = {},
): Promise<TranslateResult> {
  const accepted = new Map<string, string>();
  const rejected: TranslateResult['rejected'][number][] = [];
  let calls = 0;
  for (let from = 0; from < input.lines.length; from += TRANSLATE_BATCH_LINES) {
    const lines = input.lines.slice(from, from + TRANSLATE_BATCH_LINES);
    calls += 1;
    const result = await gateway.callModel(
      TRANSLATE_ROUTE,
      buildTranslateRequest({ ...input, lines }),
      context,
    );
    const failAll = (reason: 'declined' | 'unparseable') =>
      rejected.push(...lines.map((line) => ({ id: line.id, reason })));
    if (isDeclined(result.message)) {
      failAll('declined');
      continue;
    }
    const reply = translateReplySchema.safeParse(parseStructuredText(textOf(result.message)));
    if (!reply.success) {
      failAll('unparseable');
      continue;
    }
    const verdict = validateTranslateReply(reply.data, lines);
    for (const [id, text] of verdict.accepted) accepted.set(id, text);
    rejected.push(...verdict.rejected);
  }
  return { accepted, rejected, calls };
}
