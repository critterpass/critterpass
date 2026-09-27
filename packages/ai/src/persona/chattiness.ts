/**
 * Chattiness and reply language travel as user-turn text, never as a system message: a
 * mid-conversation system change is unsupported and would also break the cached prefix. The
 * instruction is prepended to the latest user turn only.
 */
import type Anthropic from '@anthropic-ai/sdk';

import type { ChattinessLevel, PersonaPack } from './schema';

export interface TurnDirectives {
  readonly chattiness: ChattinessLevel;
  /** BCP 47 app locale; the reply language. */
  readonly locale: string;
}

const languageName = (locale: string): string => {
  const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(locale);
  return name === undefined || name === locale ? locale : `${name} (${locale})`;
};

export function turnInstruction(pack: PersonaPack, directives: TurnDirectives): string {
  const setting = pack.chattiness[directives.chattiness];
  const words =
    setting.local_words_per_reply === 0
      ? 'no local words'
      : `at most ${setting.local_words_per_reply} local word${setting.local_words_per_reply === 1 ? '' : 's'} from your list`;
  return [
    `[Reply language: ${languageName(directives.locale)}.`,
    `Chattiness: ${directives.chattiness}, so at most ${setting.max_sentences} sentence${setting.max_sentences === 1 ? '' : 's'} and ${words}.]`,
  ].join(' ');
}

/** Prepends the directive block to the last user message, leaving earlier turns byte-identical. */
export function applyTurnDirectives(
  messages: readonly Anthropic.Messages.MessageParam[],
  pack: PersonaPack,
  directives: TurnDirectives,
): Anthropic.Messages.MessageParam[] {
  const lastUser = messages.findLastIndex((m) => m.role === 'user');
  if (lastUser === -1) throw new Error('a guide turn needs a user message');
  const instruction: Anthropic.Messages.TextBlockParam = {
    type: 'text',
    text: turnInstruction(pack, directives),
  };
  return messages.map((message, index) => {
    if (index !== lastUser) return message;
    const content =
      typeof message.content === 'string'
        ? [{ type: 'text' as const, text: message.content }]
        : message.content;
    return { role: 'user', content: [instruction, ...content] };
  });
}
