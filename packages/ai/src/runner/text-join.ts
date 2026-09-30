/**
 * Joins the answer's text across tool calls. The model writes a text block, calls a tool, then
 * writes the next text block in a fresh response that starts with no leading whitespace, so the
 * raw tokens run together ("still open.I can't check"). The first token after a tool call gets a
 * break: a line break when the text so far ends a list item or a colon (the list goes on), a
 * paragraph break otherwise. Paragraph breaks need no spaces between words, so they suit every
 * script. Text blocks with nothing between them (one reply split in parts) join verbatim.
 */

const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s/u;

function separator(before: string): string {
  if (/\s$/u.test(before)) return '';
  const lastLine = before.slice(before.lastIndexOf('\n') + 1);
  return LIST_ITEM.test(lastLine) || before.endsWith(':') ? '\n' : '\n\n';
}

export interface TextJoiner {
  /** A tool call went out: the next text starts a new part of the answer. */
  readonly toolCall: () => void;
  /** The token as it goes on the wire, with the break it needs in front. */
  readonly token: (text: string) => string;
}

export function textJoiner(): TextJoiner {
  let text = '';
  let broken = false;
  return {
    toolCall: () => {
      broken = text !== '';
    },
    token: (piece) => {
      if (piece === '') return piece;
      const joined = broken && !/^\s/u.test(piece) ? separator(text) + piece : piece;
      broken = false;
      text += joined;
      return joined;
    },
  };
}
