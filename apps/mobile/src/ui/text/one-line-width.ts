/**
 * Keeps a short hugging label on the one line the design sets it on. On Android a glyph the face
 * lacks (₫ and ≈ in Geist) is drawn from a fallback font a little wider than the text was
 * measured, so the box it hugs comes out short and the last word drops onto a second line. When
 * that happens the box is widened to the lines' drawn widths plus a space's room, and laid out
 * again on one line.
 */
import { useState } from 'react';
import type { TextStyle } from 'react-native';

/** What a laid-out line reports that this reads. */
interface DrawnLine {
  readonly width: number;
}

export interface OneLineWidth {
  /** The width the box needs, once a layout showed it short. */
  readonly style: TextStyle | null;
  /** Reads a layout; true while it is widening the box (so the wrap is not reported). */
  readonly onLines: (lines: readonly DrawnLine[]) => boolean;
}

export function oneLineMinWidth(lines: readonly DrawnLine[], fontSize: number): number {
  const drawn = lines.reduce((sum, line) => sum + line.width, 0);
  // The break swallowed a space that the single line draws again.
  return Math.ceil(drawn + fontSize / 2);
}

export function useOneLineWidth(enabled: boolean, fontSize: number): OneLineWidth {
  const [minWidth, setMinWidth] = useState(0);
  return {
    style: enabled && minWidth > 0 ? { minWidth } : null,
    onLines: (lines) => {
      if (!enabled || lines.length < 2) return false;
      const needed = oneLineMinWidth(lines, fontSize);
      if (needed <= minWidth) return false;
      setMinWidth(needed);
      return true;
    },
  };
}
