/**
 * Push copy renders with its placeholders filled in the production runtime, through the same
 * renderer and catalog loader the worker uses: a message compiled into the notification catalogs,
 * a domain template translated in its catalog, and a template carried only as source text.
 */
import { VOTE_NEEDED_TITLE, WINNER_BODY } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCopyRenderer } from '../src/push';

const nodeEnv = process.env['NODE_ENV'];

beforeAll(() => {
  process.env['NODE_ENV'] = 'production';
});

afterAll(() => {
  process.env['NODE_ENV'] = nodeEnv;
});

describe('push copy rendering', () => {
  const renderer = createCopyRenderer();

  it('fills a compiled catalog message', async () => {
    const title = await renderer.render(
      'en',
      { id: 'notifications.crew_invite.title', message: '{inviter} wants you in {crew}' },
      { inviter: 'Maya', crew: 'Bali crew' },
    );
    expect(title).toBe('Maya wants you in Bali crew');
  });

  it('renders a domain template from its catalog in the recipient language', async () => {
    expect(await renderer.render('vi', VOTE_NEEDED_TITLE, { guide: 'Mochi', crew: 'Bali' })).toBe(
      'Mochi, gửi Bali',
    );
    expect(await renderer.render('en', WINNER_BODY, { place: 'Ubud', score: '4 of 5' })).toBe(
      'Ubud won 4 of 5. Come see the reveal.',
    );
  });

  it('fills a template that is not in a catalog from its source text', async () => {
    const copy = { id: 'notifications.not_extracted.title', message: '{guide}, for {crew}' };
    expect(await renderer.render('vi', copy, { guide: 'Mochi', crew: 'Bali' })).toBe(
      'Mochi, for Bali',
    );
  });
});
