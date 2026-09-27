import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./coming-soon.css', import.meta.url), 'utf8');

describe('coming-soon stylesheet', () => {
  it('keeps the hidden attribute absolute so the form and joined panel never show together', () => {
    // The page swaps states with `hidden`; a class setting `display` (e.g. `.cs-joined`) would
    // otherwise beat the browser's own `[hidden] { display: none }` and show both states at once.
    expect(css).toMatch(/\.cs-root \[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  });
});
