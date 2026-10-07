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
import { VOICE_TAGS, VOICE_TAGS_PER_REPLY } from '../../voice-tags';

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
- Crew members' private details (budgets, calendars, health) are not yours to share; use only the flags a tool returns.
- You are inside this trip and its crew: every tool already works on them. Never ask for a trip code, id, link or name; if a tool cannot read something, say what is missing (no plan yet, a place not found).
- "What's next", "what's on day 2": read the plan (plan_read) and answer from it with the local time given in the turn. A plan whose days are empty is still the plan: add to it as below.
- Adding a place to a day: in one step, find its poi_id (places_search, by name for a place named earlier) and read the plan for its version; next step, propose_plan_changes with an add on that day_no (no fit_check or cost_quote first for a single add). Say you have proposed it for them to confirm, never that it is added, and only once propose_plan_changes returned a changeset_id.
- When plan_read gives version null the trip has no plan yet, so nothing can be added or proposed: say the plan starts once the trip's setup is finished, when you draft the whole trip, and meanwhile suggest a place or two from places_search.
- "Near my hotel" or "near <place>": places_search with near_name as they typed it (near_stay when they name no place). Give each place's distance from distance_m and check distance_from is the place they meant; if it is another place, or nothing came back, say plainly that you could not find theirs and offer the closest match.
- Our places have no ratings or reviews. A question about quality ("well rated", "đánh giá cao", "best", "ngon nhất") always calls places_search with recommended_only, near the place being talked about, even when earlier replies named places. Answer with what it returns and say these are places you recommend (why_go says why); never mention stars, scores or ratings.
- Numbers and places in earlier replies are not sources: check them again with a tool before you repeat them.
- Be specific and brief: name the places, distances, days and times the tools gave, in the traveller's language.`;

/** Said to the guide when it answers a question queued while the free answers were spent. */
export const QUEUED_QUESTION_NOTE =
  '[This question was asked last night after the free answers ran out. Answer it now, as a fresh morning reply.]';

/**
 * Said to the guide when its reply is read aloud by the speech model: it may mark the delivery
 * with a tag or two. The tags are taken out of everything shown or stored.
 */
export const SPOKEN_REPLY_NOTE = `[This reply is read aloud in your voice. You may put at most ${VOICE_TAGS_PER_REPLY} delivery tags in it, written in English in square brackets just before the words they colour, only from this list: ${VOICE_TAGS.map((tag) => `[${tag}]`).join(' ')}. They are not spoken or shown. Use none for plain facts, and never put anything else in square brackets.]`;

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
  /** The traveller's local time, so "next" and "today" mean something. */
  readonly now?: { readonly at: Date; readonly tz: string };
  /** The reply is spoken by the speech model: the guide may add delivery tags for it. */
  readonly spoken?: boolean;
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

/** `[Local time: Sat 2026-10-03 14:05 (Asia/Ho_Chi_Minh)]`, in the user turn: it changes every turn. */
export function localTimeNote(at: Date, tz: string): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(at);
  let zone = tz;
  let text: string;
  try {
    text = format(zone);
  } catch {
    zone = 'UTC';
    text = format(zone);
  }
  return `[Local time: ${text.replace(',', '')} (${zone})]`;
}

export function buildGuideChatRequest(input: GuideChatPromptInput): Required<
  Pick<GatewayInput, 'messages'>
> & {
  readonly system: Anthropic.Messages.TextBlockParam[];
} {
  const notes = [
    ...(input.now === undefined ? [] : [localTimeNote(input.now.at, input.now.tz)]),
    ...(input.queued === true ? [QUEUED_QUESTION_NOTE] : []),
    ...(input.spoken === true ? [SPOKEN_REPLY_NOTE] : []),
  ];
  const question = [...notes, input.question].join('\n');
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
