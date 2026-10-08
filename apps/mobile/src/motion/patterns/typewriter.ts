import { useEffect, useRef, useState } from 'react';

import { useReducedImpactMotion } from './shared';

const DEFAULT_WORDS_PER_SECOND = 8;

/** Splits into "word plus its trailing whitespace" chunks; joining every chunk reproduces `text` exactly. */
function wordChunksOf(text: string): readonly string[] {
  return text.match(/\S+\s*/g) ?? (text.length > 0 ? [text] : []);
}

export interface UseTypewriterOptions {
  /** The full target text (typewriter mode), or the current accumulated text (stream mode, growing over calls). */
  readonly text: string;
  readonly wordsPerSecond?: number;
  /**
   * `false` for text that is already on the page (a saved answer): the whole text is shown and no
   * timer starts. @default true
   */
  readonly enabled?: boolean;
}

export interface UseTypewriterResult {
  /** The text revealed so far, one word at a time. */
  readonly visibleText: string;
  /** The complete text — render it invisibly (e.g. `opacity: 0`) behind `visibleText` so the layout
   * reserves its final box up front and never reflows as words appear. */
  readonly fullText: string;
  readonly isRevealing: boolean;
}

/**
 * Reveals `text` one word at a time (docs/design-system.md §3.1 `typewriter`/stream reveal: "reveals
 * by word"). In stream mode, calling this again with a longer `text` (new tokens appended) continues
 * revealing from where it left off rather than restarting; an unrelated (non-prefix) `text` restarts
 * from empty. Reduced motion: the full text is visible immediately (`revealedCount` state is simply
 * never consulted in that case, so there is nothing to keep synchronized with `text` for it).
 * The timer runs only while words are left to reveal: it stops with the last word, and text that is
 * already whole (or switched off with `enabled`) starts none.
 */
export function useTypewriter({
  text,
  wordsPerSecond = DEFAULT_WORDS_PER_SECOND,
  enabled = true,
}: UseTypewriterOptions): UseTypewriterResult {
  const reduced = useReducedImpactMotion();
  const chunks = wordChunksOf(text);
  const [revealedCount, setRevealedCount] = useState(0);
  const previousTextRef = useRef('');
  // The count the timer works from, in step with `revealedCount`.
  const revealedRef = useRef(0);

  useEffect(() => {
    if (reduced || !enabled) return undefined;
    const isContinuation = text.startsWith(previousTextRef.current);
    previousTextRef.current = text;
    if (!isContinuation) {
      revealedRef.current = 0;
      setRevealedCount(0);
    }

    const intervalMs = 1000 / wordsPerSecond;
    const totalWords = wordChunksOf(text).length;
    if (revealedRef.current >= totalWords) return undefined;
    const interval = setInterval(() => {
      revealedRef.current = Math.min(revealedRef.current + 1, totalWords);
      setRevealedCount(revealedRef.current);
      if (revealedRef.current >= totalWords) clearInterval(interval);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [text, reduced, wordsPerSecond, enabled]);

  if (reduced || !enabled) {
    return { visibleText: text, fullText: text, isRevealing: false };
  }
  const clampedRevealedCount = Math.min(revealedCount, chunks.length);
  return {
    visibleText: chunks.slice(0, clampedRevealedCount).join(''),
    fullText: text,
    isRevealing: clampedRevealedCount < chunks.length,
  };
}
