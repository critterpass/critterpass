/**
 * Tool-call markup a model writes as answer text, so it never reaches a traveller. A model forced
 * to answer without tools (the turn's last round) sometimes writes the call it wanted instead:
 * DeepSeek as `<｜｜DSML｜｜ calls>…</｜｜DSML｜｜ calls>` (seen live) or
 * `<｜tool▁calls▁begin｜>…<｜tool▁calls▁end｜>` tokens, and the Anthropic format as
 * `<function_calls>…</function_calls>`. The filter streams text until something could open such a
 * block, holds the rest of the round, and at its end drops every block (an unclosed one to the end
 * of the answer) and keeps the words around it.
 */
import type Anthropic from '@anthropic-ai/sdk';

/** How a block opens and the token that closes it (null: it runs to the end of the answer). */
const BLOCKS: readonly { readonly open: RegExp; readonly close: RegExp }[] = [
  {
    open: /<｜+\s*DSML\s*｜+\s*(?:function_)?calls\s*>/u,
    close: /<\/｜+\s*DSML\s*｜+\s*(?:function_)?calls\s*>/u,
  },
  { open: /<｜+\s*DSML\s*｜+[^>]*>/u, close: /<\/｜+\s*DSML\s*｜+\s*invoke\s*>/u },
  { open: /<｜tool▁calls▁begin｜>/u, close: /<｜tool▁calls▁end｜>/u },
  { open: /<｜tool▁call▁begin｜>/u, close: /<｜tool▁call▁end｜>/u },
  { open: /<function_calls>/u, close: /<\/function_calls>/u },
  { open: /<invoke\s+name=/u, close: /<\/invoke>/u },
];

/** Literal starts of a block: text that could become one is held until it is clear. */
const OPENERS = ['<｜', '<function_calls>', '<invoke '];

/** Some words left: at least two letters in a row, in any script. */
export function hasWords(text: string): boolean {
  return /\p{L}{2}/u.test(text);
}

/** Where a held tail starts: a `<` that could still grow into an opener, else trailing space. */
function holdFrom(text: string): number {
  const lt = text.lastIndexOf('<');
  if (lt !== -1) {
    const tail = text.slice(lt);
    if (OPENERS.some((opener) => opener.startsWith(tail) || tail.startsWith(opener))) return lt;
  }
  return text.length - (/\s*$/u.exec(text)?.[0].length ?? 0);
}

function firstOpener(text: string): number {
  const found = OPENERS.map((opener) => text.indexOf(opener)).filter((index) => index !== -1);
  return found.length === 0 ? -1 : Math.min(...found);
}

/** The whitespace a removed block leaves: the widest break that was around it. */
function separator(space: string): string {
  if (space.includes('\n\n')) return '\n\n';
  if (space.includes('\n')) return '\n';
  return space === '' ? '' : ' ';
}

/**
 * Drops every markup block from `text`; `found` says whether there was one. `preceded`: words were
 * already sent before `text`, so a block at its start still leaves a break behind.
 */
export function stripToolMarkup(
  text: string,
  preceded = false,
): { readonly text: string; readonly found: boolean } {
  let out = text;
  let found = false;
  for (;;) {
    const hits = BLOCKS.map((block) => ({ block, at: out.search(block.open) })).filter(
      (hit) => hit.at !== -1,
    );
    if (hits.length === 0) break;
    const { block, at } = hits.reduce((a, b) => (b.at < a.at ? b : a));
    const rest = out.slice(at);
    const close = block.close.exec(rest);
    const end = close === null ? out.length : at + close.index + close[0].length;
    const before = out.slice(0, at);
    const after = out.slice(end);
    const space = (/\s*$/u.exec(before)?.[0] ?? '') + (/^\s*/u.exec(after)?.[0] ?? '');
    const kept = before.trimEnd();
    const next = after.trimStart();
    const between = (kept !== '' || preceded) && next !== '' ? separator(space) : '';
    out = kept + between + next;
    found = true;
  }
  return { text: found ? out.trimEnd() : out, found };
}

export interface ToolMarkupFilter {
  /** Text that is safe to stream now. */
  push(token: string): string;
  /** The rest of the round, markup removed; `found` when any was. */
  end(): { readonly text: string; readonly found: boolean };
}

export function toolMarkupFilter(): ToolMarkupFilter {
  let held = '';
  let blocked = false;
  let emitted = '';
  return {
    push(token) {
      held += token;
      if (blocked) return '';
      const opener = firstOpener(held);
      const cut = opener === -1 ? holdFrom(held) : holdFrom(held.slice(0, opener));
      if (opener !== -1) blocked = true;
      const out = held.slice(0, cut);
      held = held.slice(cut);
      emitted += out;
      return out;
    },
    end() {
      const { text, found } = stripToolMarkup(held, emitted !== '');
      held = '';
      // A block that closed the answer leaves no trailing space behind.
      if (found && emitted !== '' && text.trim() === '') return { text: '', found };
      return { text, found };
    },
  };
}

/** Said with the one retry after an answer that was only markup. */
export const PLAIN_ANSWER_NOTE =
  '[Answer the traveller now, in plain words only: no tool calls and no markup. If something is still to do, say what you would do next.]';

/** Appends the note to the latest user turn, the closest place to the answer. */
export function withPlainAnswerNote(
  messages: readonly Anthropic.Messages.MessageParam[],
): Anthropic.Messages.MessageParam[] {
  const last = messages.findLastIndex((m) => m.role === 'user');
  return messages.map((message, index) => {
    if (index !== last) return message;
    const content =
      typeof message.content === 'string'
        ? [{ type: 'text' as const, text: message.content }]
        : message.content;
    return { role: 'user', content: [...content, { type: 'text', text: PLAIN_ANSWER_NOTE }] };
  });
}

export type ToolMarkupOutcome = 'stripped' | 'retried' | 'fallback';

/** The log event every surface writes for a markup answer, so they can be counted together. */
export const TOOL_MARKUP_LOG_EVENT = 'ai.tool_markup';

/** The `onToolMarkup` hook that logs the typed event on a pino-style logger. */
export function logToolMarkup(logger: { warn(details: object, message: string): void }) {
  return (event: ToolMarkupEvent): void =>
    logger.warn({ event: TOOL_MARKUP_LOG_EVENT, ...event }, 'tool-call markup in an answer');
}

/** One answer that came back with tool-call markup, for the caller to log and count. */
export interface ToolMarkupEvent {
  readonly route: string;
  readonly round: number;
  /** The round was the forced last one (tools offered with tool_choice none). */
  readonly forced: boolean;
  readonly outcome: ToolMarkupOutcome;
}
