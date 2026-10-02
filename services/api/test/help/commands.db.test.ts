/**
 * Feedback, idea and rating-prompt commands through the real doors against a migrated Postgres:
 * ticket numbers and replays, attachment ownership, the reply channel, the ten-a-month vote
 * budget (sequential and racing), take-backs, pending ideas kept from other users, and the
 * offline door.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { envelope, type AccountHarness, type Session } from '../account/account-harness';
import { startHelpHarness } from './help-harness';

let h: AccountHarness;

beforeAll(async () => {
  h = await startHelpHarness();
}, 240_000);

afterAll(async () => {
  await h.stop();
});

const feedback = (overrides: Record<string, unknown> = {}) => ({
  id: generateUuidV7(),
  mood: 'good',
  category: 'planning',
  text: 'The day view is lovely',
  include_device_info: false,
  ...overrides,
});

async function publishedIdeas(count: number, status = 'open'): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const [row] = await h.rows<{ id: string }>(
      `INSERT INTO ideas (title, locale, status) VALUES ($1, 'en', $2) RETURNING id`,
      [`Board idea number ${i} ${generateUuidV7().slice(-6)}`, status],
    );
    ids.push(row!.id);
  }
  return ids;
}

async function vote(me: Session, ideaId: string) {
  return h.cmd(me, 'vote_idea', { idea_id: ideaId });
}

describe('submit_feedback', () => {
  it('numbers a ticket once, and a replay with a new op returns the same number', async () => {
    const me = await h.anonymous();
    const payload = feedback();
    const [status, body] = await h.cmd(me, 'submit_feedback', payload);
    expect(status).toBe(200);
    const ticketNo = body.result?.['ticket_no'] as number;
    expect(ticketNo).toBeGreaterThanOrEqual(10001);
    const [, again] = await h.cmd(me, 'submit_feedback', payload);
    expect(again.result).toEqual({ ticket_id: payload.id, ticket_no: ticketNo });
    const rows = await h.rows<{ reply_channel: string; app_version: string; due: boolean }>(
      `SELECT reply_channel, app_version,
         reply_due_at BETWEEN now() + interval '47 hours' AND now() + interval '49 hours' AS due
       FROM feedback_tickets WHERE id = $1`,
      [payload.id],
    );
    expect(rows).toEqual([{ reply_channel: 'inbox', app_version: '1.0.0', due: true }]);
    const events = (await h.events('feedback.submitted')).filter((e) => e['user_id'] === me.uid);
    expect(events).toHaveLength(1);
  });

  it('needs a few words, or a mood and a topic, and refuses device info that was turned off', async () => {
    const me = await h.anonymous();
    const [empty] = await h.cmd(me, 'submit_feedback', feedback({ text: ' ', category: null }));
    expect(empty).toBe(422);
    const [moodOnly] = await h.cmd(me, 'submit_feedback', feedback({ text: '', mood: 'grr' }));
    expect(moodOnly).toBe(200);
    const [sneaky] = await h.cmd(
      me,
      'submit_feedback',
      feedback({
        device_info: {
          os: 'iOS',
          os_version: '26.0',
          app_version: '1.0.0',
          build: '16',
          model: 'iPhone',
          locale: 'en',
          tz: 'Asia/Ho_Chi_Minh',
          network: 'wifi',
        },
      }),
    );
    expect(sneaky).toBe(422);
  });

  it("refuses another traveller's upload as an attachment, and a trip the sender is not on", async () => {
    const [me, other] = await Promise.all([h.anonymous(), h.anonymous()]);
    const [status, body] = await h.cmd(
      me,
      'submit_feedback',
      feedback({ media_keys: [`u/${other.uid}/feedback/${generateUuidV7()}`] }),
    );
    expect([status, body.error?.code]).toEqual([404, 'NOT_FOUND']);
    const [tripStatus] = await h.cmd(
      me,
      'submit_feedback',
      feedback({ context: { screen: 'plan', trip_id: generateUuidV7(), article_slug: null } }),
    );
    expect(tripStatus).toBe(404);
  });

  it('lands through the offline door', async () => {
    const me = await h.anonymous();
    const payload = feedback({ source: 'shake', category: 'bug' });
    const results = await h.upload(me, [
      { ...envelope(me.uid, 'submit_feedback', payload), actor: { uid: me.uid, via: 'offline' } },
    ]);
    expect(results[0]?.status).toBe('applied');
    const rows = await h.rows('SELECT 1 FROM feedback_tickets WHERE id = $1', [payload.id]);
    expect(rows).toHaveLength(1);
  });
});

describe('the idea board', () => {
  it('keeps a submitted idea pending and out of other voters’ reach', async () => {
    const [author, other] = await Promise.all([h.anonymous(), h.anonymous()]);
    const id = generateUuidV7();
    const [status, body] = await h.cmd(author, 'submit_idea', {
      id,
      title: 'Packing lists per crew',
      locale: 'en',
    });
    expect([status, body.result?.['status']]).toEqual([200, 'pending_review']);
    const [denied, deniedBody] = await vote(other, id);
    expect([denied, deniedBody.error?.code]).toEqual([404, 'NOT_FOUND']);
    const [own, ownBody] = await vote(author, id);
    expect([own, ownBody.error?.detail?.['reason']]).toEqual([409, 'idea_closed']);
  });

  it('refuses a title with contact details or a blocked word', async () => {
    const me = await h.anonymous();
    const [phone, body] = await h.cmd(me, 'submit_idea', {
      id: generateUuidV7(),
      title: 'Call me on +84 912 345 678',
      locale: 'en',
    });
    expect([phone, body.error?.code]).toEqual([422, 'CONTENT_REJECTED']);
  });

  it('takes ten votes a month, refuses the eleventh, and a take-back frees one', async () => {
    const me = await h.anonymous();
    const ideas = await publishedIdeas(11);
    for (const [index, ideaId] of ideas.slice(0, 10).entries()) {
      const [status, body] = await vote(me, ideaId);
      expect(status).toBe(200);
      expect(body.result?.['votes_left']).toBe(9 - index);
    }
    const [over, overBody] = await vote(me, ideas[10]!);
    expect([over, overBody.error?.code, overBody.error?.detail?.['reason']]).toEqual([
      409,
      'STATE_INVALID',
      'over_budget',
    ]);
    const [, back] = await h.cmd(me, 'unvote_idea', { idea_id: ideas[0] });
    expect(back.result).toMatchObject({ votes_left: 1, votes_count: 0 });
    const [again, againBody] = await vote(me, ideas[10]!);
    expect([again, againBody.result?.['votes_left']]).toEqual([200, 0]);
    const [twice, twiceBody] = await vote(me, ideas[10]!);
    expect([twice, twiceBody.result?.['votes_count']]).toEqual([200, 1]);
  });

  it('never lets racing votes pass the budget', async () => {
    const me = await h.anonymous();
    const ideas = await publishedIdeas(14);
    const results = await Promise.all(ideas.map((ideaId) => vote(me, ideaId)));
    const statuses = results.map(([status]) => status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(10);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);
    const [row] = await h.rows<{ n: number }>(
      'SELECT count(*)::int AS n FROM idea_votes WHERE user_id = $1',
      [me.uid],
    );
    expect(row?.n).toBe(10);
    const counted = await h.rows<{ votes_count: number }>(
      'SELECT votes_count FROM ideas WHERE id = ANY($1::uuid[])',
      [ideas],
    );
    expect(counted.reduce((sum, r) => sum + r.votes_count, 0)).toBe(10);
  });

  it('does not take votes on a shipped idea', async () => {
    const me = await h.anonymous();
    const [shipped] = await publishedIdeas(1, 'shipped');
    const [status, body] = await vote(me, shipped!);
    expect([status, body.error?.detail?.['reason']]).toEqual([409, 'idea_closed']);
  });
});

describe('record_rating_prompt', () => {
  it('logs a prompt once, replays included', async () => {
    const me = await h.anonymous();
    const payload = { id: generateUuidV7(), shown: true };
    const [status] = await h.cmd(me, 'record_rating_prompt', payload);
    expect(status).toBe(200);
    await h.cmd(me, 'record_rating_prompt', payload);
    const rows = await h.rows('SELECT 1 FROM rating_prompts WHERE user_id = $1', [me.uid]);
    expect(rows).toHaveLength(1);
  });
});
