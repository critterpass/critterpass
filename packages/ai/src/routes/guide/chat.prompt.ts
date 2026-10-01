/**
 * The guide sheet's turn (docs/api-contracts.md §5.3, route `guide.chat`): persona layers and the
 * trip context as cached system blocks, the guide chat rules, the thread's recent history, and the
 * question with any attachment text as untrusted data. Numbers reach the answer only from tools;
 * web facts are cited, never carried into a plan change or a cost.
 */
import type Anthropic from '@anthropic-ai/sdk';

import type { GatewayInput } from '../../client';
import { userTurnWithData, type UntrustedBlock } from '../../context/wrap-untrusted';
import { applyTurnDirectives, type TurnDirectives } from '../../persona/chattiness';
import { buildSystemBlocks } from '../../persona/layering';
import type { PersonaPack } from '../../persona/schema';

type MessageParam = Anthropic.Messages.MessageParam;

export interface GuideHistoryTurn {
  readonly role: 'user' | 'guide';
  readonly content: string;
}

/** Past turns the guide sees; older ones stay in the thread but out of the prompt. */
export const GUIDE_HISTORY_TURNS = 12;

export const GUIDE_CHAT_RULES = `# Guide chat

- Times, prices, counts, distances and opening hours come only from tool results or the trip context. When no tool can check a fact, say you cannot check it; never guess.
- A fact from a web search is quoted with its source, and a web number never goes into a plan change, a cost, a split or a booking.
- Changes to the plan, votes, holds and expenses are proposals the crew confirms: say what you propose, never that it is done.
- Never say seats or tables are held unless a hold came back from a tool.
- Crew members' private details (budgets, calendars, health) are not yours to share; use only the flags a tool returns.`;

/** Said to the guide when it answers a question queued while the free answers were spent. */
export const QUEUED_QUESTION_NOTE =
  '[This question was asked last night after the free answers ran out. Answer it now, as a fresh morning reply.]';

export interface GuideChatPromptInput {
  readonly pack: PersonaPack;
  readonly tripContext: string | undefined;
  readonly history: readonly GuideHistoryTurn[];
  readonly question: string;
  /** Attachment text (OCR, a shared place's tips) wrapped as untrusted data. */
  readonly documents?: readonly UntrustedBlock[];
  readonly directives: TurnDirectives;
  /** The question waited for the meter reset (queued answer). */
  readonly queued?: boolean;
  /**
   * The thread has no local guide of its own (no trip, or a trip whose destination has none): the
   * default guide answers for any destination.
   */
  readonly anywhere?: boolean;
}

/** Alternating user/assistant turns that start with the user, as the Messages API requires. */
export function historyMessages(history: readonly GuideHistoryTurn[]): MessageParam[] {
  const recent = history.slice(-GUIDE_HISTORY_TURNS);
  const start = recent.findIndex((turn) => turn.role === 'user');
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const turn of start === -1 ? [] : recent.slice(start)) {
    const role = turn.role === 'user' ? 'user' : 'assistant';
    const last = out.at(-1);
    if (last?.role === role) last.content = `${last.content}\n\n${turn.content}`;
    else out.push({ role, content: turn.content });
  }
  // The new question is the next user turn, so the history must end on the guide.
  if (out.at(-1)?.role === 'user') out.pop();
  return out;
}

export function guideSystemBlocks(
  pack: PersonaPack,
  tripContext: string | undefined,
  rules: string,
  anywhere = false,
): Anthropic.Messages.TextBlockParam[] {
  const blocks = buildSystemBlocks({
    pack,
    ...(tripContext === undefined ? {} : { tripContext }),
    ...(anywhere ? { anywhere } : {}),
  });
  // Static rules sit right after the persona, so the trip layer stays last in the cache order.
  blocks.splice(2, 0, { type: 'text', text: rules, cache_control: { type: 'ephemeral' } });
  return blocks;
}

export function buildGuideChatRequest(input: GuideChatPromptInput): Required<
  Pick<GatewayInput, 'messages'>
> & {
  readonly system: Anthropic.Messages.TextBlockParam[];
} {
  const question =
    input.queued === true ? `${QUEUED_QUESTION_NOTE}\n${input.question}` : input.question;
  const messages = [
    ...historyMessages(input.history),
    userTurnWithData(question, input.documents ?? []),
  ];
  return {
    system: guideSystemBlocks(
      input.pack,
      input.tripContext,
      GUIDE_CHAT_RULES,
      input.anywhere === true,
    ),
    messages: applyTurnDirectives(messages, input.pack, input.directives),
  };
}
