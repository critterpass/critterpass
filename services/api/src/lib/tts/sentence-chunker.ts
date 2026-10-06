/**
 * Splits a streamed reply into the pieces the voice speaks one after another. The first piece
 * ends at the first clause break once it is long enough to sound natural, so audio starts while
 * the model is still writing; later pieces end at sentence ends. A run-on piece is cut at a space
 * so no request waits on an endless sentence.
 */

export interface SentenceChunker {
  /** Adds streamed text; returns the pieces it completed. */
  push(text: string): string[];
  /** The rest, when the reply has ended. */
  flush(): string[];
}

export interface ChunkerOptions {
  /** The first piece may end at a comma once it has this many characters. */
  readonly firstClauseChars?: number;
  /** A sentence shorter than this joins the next one ("Yes." on its own sounds clipped). */
  readonly minChars?: number;
  /** A piece longer than this is cut at its last space. */
  readonly maxChars?: number;
}

/** Sentence ends (Latin and CJK), each needing a space or the end after it, except CJK. */
const SENTENCE_END = /[.!?…]+["'”’)]*\s|[。！？]+/gu;
const CLAUSE_END = /[,;:—–]\s|[，、；：]/gu;

/** The end of the first break that leaves at least `from` characters before it, or -1. */
function breakAfter(text: string, pattern: RegExp, from: number): number {
  let end = -1;
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const at = match.index + match[0].length;
    if (at >= from) {
      end = at;
      break;
    }
  }
  return end;
}

export function createSentenceChunker(options: ChunkerOptions = {}): SentenceChunker {
  const firstClause = options.firstClauseChars ?? 24;
  const minChars = options.minChars ?? 12;
  const maxChars = options.maxChars ?? 220;
  let buffer = '';
  let emitted = 0;

  const take = (end: number): string => {
    const piece = buffer.slice(0, end).trim();
    buffer = buffer.slice(end);
    emitted += 1;
    return piece;
  };

  const next = (): string | null => {
    if (emitted === 0) {
      const clause = breakAfter(buffer, CLAUSE_END, firstClause);
      const sentence = breakAfter(buffer, SENTENCE_END, minChars);
      const ends = [clause, sentence].filter((at) => at > 0);
      if (ends.length > 0) return take(Math.min(...ends));
    } else {
      const sentence = breakAfter(buffer, SENTENCE_END, minChars);
      if (sentence > 0) return take(sentence);
    }
    if (buffer.length > maxChars) {
      const space = buffer.lastIndexOf(' ', maxChars);
      return take(space > 0 ? space + 1 : maxChars);
    }
    return null;
  };

  return {
    push(text) {
      buffer += text;
      const pieces: string[] = [];
      for (let piece = next(); piece !== null; piece = next()) {
        if (piece.length > 0) pieces.push(piece);
      }
      return pieces;
    },
    flush() {
      const rest = buffer.trim();
      buffer = '';
      return rest.length > 0 ? [rest] : [];
    },
  };
}
