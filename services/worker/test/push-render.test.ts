/**
 * Push copy renders with its placeholders filled in the production runtime, through the same
 * renderer and catalog loader the worker uses: a message compiled into the notification catalogs,
 * a domain template translated in its catalog, and a template carried only as source text.
 */
import { CRITTER_PUSH, LA_COPY, QUEST_PUSH, VOTE_NEEDED_TITLE, WINNER_BODY } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PROPOSAL_PUSH } from '../src/jobs/proposal/notify';
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

  it('renders proposal, quest, critter and Live Activity pushes in the recipient language', async () => {
    expect(
      await renderer.render('vi-VN', PROPOSAL_PUSH.versionTitle, {
        guide: 'Chà Vá',
        place: 'Đà Nẵng',
      }),
    ).toBe('Chà Vá đã viết bản Đà Nẵng của bạn');
    expect(await renderer.render('vi', PROPOSAL_PUSH.replyByBody, { date: '2 thg 10' })).toBe(
      'Cả nhóm cần bạn trả lời trước 2 thg 10.',
    );
    expect(await renderer.render('vi', QUEST_PUSH.readyBody, { count: 3, place: 'Đà Nẵng' })).toBe(
      'Có 3 nhiệm vụ cho Đà Nẵng.',
    );
    expect(await renderer.render('vi', CRITTER_PUSH.hatchedTitle)).toBe('Trứng của bạn đã nở!');
    expect(
      await renderer.render('vi', LA_COPY.leaveByStartTitle, { time: '06:30', place: 'Bà Nà' }),
    ).toBe('Xuất phát lúc 06:30 · Bà Nà');
    expect(await renderer.render('en', QUEST_PUSH.doneBody, { xp: 40 })).toBe(
      '+40 XP for the crew.',
    );
  });

  it('fills a template that is not in a catalog from its source text', async () => {
    const copy = { id: 'notifications.not_extracted.title', message: '{guide}, for {crew}' };
    expect(await renderer.render('vi', copy, { guide: 'Mochi', crew: 'Bali' })).toBe(
      'Mochi, for Bali',
    );
  });
});
