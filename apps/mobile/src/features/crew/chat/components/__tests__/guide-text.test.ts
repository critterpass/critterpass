import { describe, expect, it } from '@jest/globals';

import { tidyGuideText } from '../guide-text';

describe('a guide line with a gloss in brackets', () => {
  it('turns a gloss inside a gloss into a comma', () => {
    expect(tidyGuideText('Say terima kasih (thank you (Indonesian)) to the driver.')).toBe(
      'Say terima kasih (thank you, Indonesian) to the driver.',
    );
  });

  it('reads a doubled pair as one', () => {
    expect(tidyGuideText('Try kaiseki ((the many-course dinner)) tonight.')).toBe(
      'Try kaiseki (the many-course dinner) tonight.',
    );
  });

  it('sets off what follows an inner pair', () => {
    expect(tidyGuideText('festa (festival (Portuguese) in June)')).toBe(
      'festa (festival, Portuguese, in June)',
    );
  });

  it('leaves single and side-by-side brackets alone', () => {
    const line = 'Inti (the sun) rises at 06:10 (a little earlier in June).';
    expect(tidyGuideText(line)).toBe(line);
    expect(tidyGuideText('No brackets at all')).toBe('No brackets at all');
  });

  it('never rewrites what an answer still streaming has already shown', () => {
    const full = 'Say terima kasih (thank you (Indonesian)), then smile (a lot).';
    const done = tidyGuideText(full);
    for (let end = 1; end <= full.length; end += 1) {
      const shown = tidyGuideText(full.slice(0, end)).trimEnd();
      expect(done.startsWith(shown.replace(/,$/u, ''))).toBe(true);
    }
  });
});
