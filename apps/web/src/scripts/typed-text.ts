/* eslint-disable lingui/no-unlocalized-strings -- a media query, not UI copy; the line it types arrives translated. */
/**
 * Typewriter loop for the hero's handwritten line (`tg-type` in the design script): types forward,
 * holds, erases, repeats. Renders the full line once and stops under reduced motion.
 */
const TYPE_SPEED_MS = 55;
const ERASE_SPEED_MS = 28;
const HOLD_MS = 3200;

/** Whole characters as a reader sees them, so a Thai vowel or tone mark never types on its own. */
function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter !== 'function') return Array.from(text);
  return Array.from(new Intl.Segmenter().segment(text), (part) => part.segment);
}

export function startTypedText(el: Element | null, text: string): () => void {
  if (!el) return () => {};
  const target = el;
  const letters = graphemes(text);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    target.textContent = text;
    return () => {};
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function typeForward(index: number): void {
    if (stopped) return;
    target.textContent = letters.slice(0, index).join('');
    if (index < letters.length) {
      timer = setTimeout(() => typeForward(index + 1), TYPE_SPEED_MS);
    } else {
      timer = setTimeout(() => eraseBackward(letters.length), HOLD_MS);
    }
  }

  function eraseBackward(index: number): void {
    if (stopped) return;
    target.textContent = letters.slice(0, index).join('');
    if (index > 0) {
      timer = setTimeout(() => eraseBackward(index - 1), ERASE_SPEED_MS);
    } else {
      timer = setTimeout(() => typeForward(0), 400);
    }
  }

  typeForward(0);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
