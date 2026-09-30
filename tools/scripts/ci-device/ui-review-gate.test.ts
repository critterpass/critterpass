import { describe, expect, it } from 'vitest';

import { decide, isUiChange } from './ui-review-gate';

describe('UI review gate', () => {
  it('counts screens, features and shared components, not their tests', () => {
    expect(isUiChange('apps/mobile/src/app/crew/new.tsx')).toBe(true);
    expect(isUiChange('apps/mobile/src/features/vote/showdown/showdown.tsx')).toBe(true);
    expect(isUiChange('apps/mobile/src/ui/shell/BackEyebrow.tsx')).toBe(true);
    expect(isUiChange('apps/mobile/src/ui/shell/__tests__/back.test.tsx')).toBe(false);
    expect(isUiChange('apps/mobile/src/features/vote/showdown.test.ts')).toBe(false);
    expect(isUiChange('apps/mobile/src/features/home/test-support/seed.ts')).toBe(false);
    expect(isUiChange('apps/mobile/src/app/__mocks__/mock-skia.tsx')).toBe(false);
    expect(isUiChange('apps/mobile/src/lib/links/route-map.ts')).toBe(false);
    expect(isUiChange('services/api/src/app/index.ts')).toBe(false);
  });

  it('passes a pull request with no UI change', () => {
    expect(decide({ changed: ['docs/README.md'], labelled: false }).pass).toBe(true);
  });

  it('fails a UI change until it is labelled', () => {
    const changed = ['apps/mobile/src/ui/text/Text.tsx'];
    const unreviewed = decide({ changed, labelled: false });
    expect(unreviewed.pass).toBe(false);
    expect(unreviewed.message).toContain('apps/mobile/src/ui/text/Text.tsx');
    expect(decide({ changed, labelled: true }).pass).toBe(true);
  });

  it('takes the label off when a push changes UI files after the review', () => {
    const changed = ['apps/mobile/src/ui/text/Text.tsx', 'docs/a.md'];
    const again = decide({ changed, labelled: true, pushed: ['apps/mobile/src/ui/text/Text.tsx'] });
    expect(again).toMatchObject({ pass: false, removeLabel: true });
    const docsOnly = decide({ changed, labelled: true, pushed: ['docs/a.md'] });
    expect(docsOnly).toMatchObject({ pass: true, removeLabel: false });
  });
});
