import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { DEFAULT_APP_ICON, type AppIconBaseId } from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import { APP_ICON_PREVIEWS, type AppIconLook } from '../app-icon-previews';

/** The alternates the icon plugin bundles by default (its `DEFAULT_ALTERNATE_IDS`). */
const ALTERNATES: readonly AppIconBaseId[] = ['face', 'pon', 'sardi', 'temple'];
const LOOKS: readonly AppIconLook[] = ['any', 'dark', 'tinted'];
const PREVIEWS_DIR = path.join(__dirname, '..', 'previews');

// The picker lists an icon only when it has a preview, so an icon the build ships without one
// would silently go missing from the picker, and one without a picture would be a blank tile.
describe('app icon previews', () => {
  const shipped = [DEFAULT_APP_ICON, ...ALTERNATES];

  it.each(shipped)('has a picture of %s in every look the phone can show', (id) => {
    const preview = APP_ICON_PREVIEWS[id];
    expect(preview).toBeDefined();
    for (const look of LOOKS) {
      expect(preview?.[look]).toBeTruthy();
      const file = path.join(PREVIEWS_DIR, `${id}-${look}.png`);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(0);
    }
  });

  it('keeps no preview for an icon the build does not ship', () => {
    expect(Object.keys(APP_ICON_PREVIEWS).sort()).toEqual([...shipped].sort());
  });
});
