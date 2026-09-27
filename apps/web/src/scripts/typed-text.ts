/* eslint-disable lingui/no-unlocalized-strings -- vanilla DOM copy, not JSX; see coming-soon-client.ts. */
/**
 * Typewriter loop for the hero's handwritten line (`tg-type` in the design script): types forward,
 * holds, erases, repeats. Renders the full line once and stops under reduced motion.
 */
const TYPE_SPEED_MS = 55;
const ERASE_SPEED_MS = 28;
const HOLD_MS = 3200;

export function startTypedText(el: Element | null, text: string): () => void {
  if (!el) return () => {};
  const target = el;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    target.textContent = text;
    return () => {};
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function typeForward(index: number): void {
    if (stopped) return;
    target.textContent = text.slice(0, index);
    if (index < text.length) {
      timer = setTimeout(() => typeForward(index + 1), TYPE_SPEED_MS);
    } else {
      timer = setTimeout(() => eraseBackward(text.length), HOLD_MS);
    }
  }

  function eraseBackward(index: number): void {
    if (stopped) return;
    target.textContent = text.slice(0, index);
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
