import { describe, expect, it } from '@jest/globals';

import { debugMotionControlsEnabled } from '../slowmo';

describe('debugMotionControlsEnabled', () => {
  it('is on under a dev server whatever the variant', () => {
    expect(debugMotionControlsEnabled(true, 'production')).toBe(true);
  });

  it('is on in release builds of the development and staging variants (the Maestro e2e build)', () => {
    expect(debugMotionControlsEnabled(false, 'development')).toBe(true);
    expect(debugMotionControlsEnabled(false, 'staging')).toBe(true);
  });

  it('is off in a production release build', () => {
    expect(debugMotionControlsEnabled(false, 'production')).toBe(false);
  });

  it('treats a missing or unknown variant as production', () => {
    expect(debugMotionControlsEnabled(false, undefined)).toBe(false);
    expect(debugMotionControlsEnabled(false, 'preview')).toBe(false);
  });
});
