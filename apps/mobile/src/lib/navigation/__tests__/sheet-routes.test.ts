/** Every sheet route outside `(modal)` names a route file, so a cold start can cut it by path. */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { SHEET_ROUTES } from '../sheet-routes';

describe('sheet routes outside (modal)', () => {
  it('names a route file for every sheet', () => {
    const app = path.join(__dirname, '../../../app');
    for (const route of SHEET_ROUTES) {
      expect([route, existsSync(path.join(app, `${route}.tsx`))]).toEqual([route, true]);
    }
  });
});
