/**
 * The running-late push in the recipient's language, through the worker's own renderer and
 * catalog loader: the late member is told they can choose, the waiting ones who is late.
 */
import { DISRUPTION_PUSH } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCopyRenderer } from '../../src/push';

const nodeEnv = process.env['NODE_ENV'];

beforeAll(() => {
  process.env['NODE_ENV'] = 'production';
});

afterAll(() => {
  process.env['NODE_ENV'] = nodeEnv;
});

describe('running-late push copy', () => {
  const renderer = createCopyRenderer();
  const vars = { place: 'Karsa Spa', minutes: 25, names: 'Wes, Jordan', count: 2 };

  it('renders in Vietnamese for a Vietnamese phone', async () => {
    expect(await renderer.render('vi', DISRUPTION_PUSH.lateTitle, vars)).toBe(
      'Karsa Spa · +25 phút',
    );
    expect(await renderer.render('vi-VN', DISRUPTION_PUSH.lateBodyYou, vars)).toBe(
      'Bạn đang trễ 25 phút. Chạm để xem bạn có thể làm gì.',
    );
    expect(await renderer.render('vi', DISRUPTION_PUSH.lateBodyWaiting, vars)).toBe(
      'Wes, Jordan đang trễ 25 phút.',
    );
  });

  it('agrees with one late member and with several in English', async () => {
    expect(await renderer.render('en', DISRUPTION_PUSH.lateBodyWaiting, vars)).toBe(
      'Wes, Jordan are running 25 min late.',
    );
    expect(
      await renderer.render('en', DISRUPTION_PUSH.lateBodyWaiting, {
        ...vars,
        names: 'Wes',
        count: 1,
      }),
    ).toBe('Wes is running 25 min late.');
  });
});
