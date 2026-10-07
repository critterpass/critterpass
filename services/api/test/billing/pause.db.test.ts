/**
 * A planned Pass+ pause on the App Store. The member's resume date lands on their monthly row,
 * arms one reminder a week before it, and survives the store's later reports until they turn
 * renewal back on. It grants nothing, and only someone with a monthly App Store Pass+ can plan one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
import {
  apply,
  loadFixture,
  startBillingHarness,
  stateOf,
  storeEvent,
  type BillingHarness,
} from './billing-harness';

let harness: BillingHarness;

beforeAll(async () => {
  harness = await startBillingHarness();
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Math.floor(Date.now() / 1000) * 1000 + days * DAY_MS);

/** Plays the App Store lifecycle up to and including the step of `type`. */
async function playTo(user: SignedIn, type: string, from = 0): Promise<number> {
  const { steps } = loadFixture('pass-app-store-lifecycle', user.uid);
  const last = steps.findIndex((step) => step.webhook.event['type'] === type);
  for (const step of steps.slice(from, last + 1)) {
    harness.revenuecat.set(user.uid, step.subscriber);
    await apply(harness, await storeEvent(harness, step.webhook), new Date(step.now));
  }
  return last + 1;
}

async function pauseOf(uid: string) {
  const sub = await harness.pool.query<{ id: string; resume_at: Date | null }>(
    "SELECT id, resume_at FROM subscriptions WHERE user_id = $1 AND product_key = 'pass_monthly'",
    [uid],
  );
  const row = sub.rows[0];
  const timers = await harness.pool.query<{ due_at: Date }>(
    "SELECT due_at FROM scheduled_events WHERE kind = 'pause.remind' AND ref_id = $1 AND status = 'pending'",
    [row?.id ?? null],
  );
  const events = await harness.pool.query(
    "SELECT 1 FROM domain_events WHERE type = 'subscription.pause_intended' AND payload->>'user_id' = $1",
    [uid],
  );
  return {
    resumeAt: row?.resume_at?.toISOString() ?? null,
    timers: timers.rows.map((timer) => timer.due_at.toISOString()),
    events: events.rows.length,
  };
}

describe('set_pause_intent', () => {
  it('records the resume date, arms one reminder a week before it and changes no entitlement', async () => {
    const user = await harness.signIn();
    await playTo(user, 'INITIAL_PURCHASE');
    const resume = inDays(60);
    const response = await harness.run(user, 'set_pause_intent', {
      resume_at: resume.toISOString(),
    });
    const remind = new Date(resume.getTime() - 7 * DAY_MS).toISOString();
    expect(resultOf(response)).toMatchObject({
      resume_at: resume.toISOString(),
      remind_at: remind,
    });
    expect(await pauseOf(user.uid)).toEqual({
      resumeAt: resume.toISOString(),
      timers: [remind],
      events: 1,
    });
    expect((await stateOf(harness.pool, user.uid)).passPlus).toBe(true);

    // Sent again, and then with a later date: still one reminder, moved to the new date.
    await harness.run(user, 'set_pause_intent', { resume_at: resume.toISOString() });
    expect((await pauseOf(user.uid)).events).toBe(1);
    const later = inDays(90);
    await harness.run(user, 'set_pause_intent', { resume_at: later.toISOString() });
    expect(await pauseOf(user.uid)).toEqual({
      resumeAt: later.toISOString(),
      timers: [new Date(later.getTime() - 7 * DAY_MS).toISOString()],
      events: 2,
    });
  });

  it("keeps the date through the store's reports until renewal is turned back on", async () => {
    const user = await harness.signIn();
    const next = await playTo(user, 'RENEWAL');
    const resume = inDays(45);
    await harness.run(user, 'set_pause_intent', { resume_at: resume.toISOString() });
    const afterCancel = await playTo(user, 'CANCELLATION', next);
    expect((await pauseOf(user.uid)).resumeAt).toBe(resume.toISOString());
    await playTo(user, 'UNCANCELLATION', afterCancel);
    expect((await pauseOf(user.uid)).resumeAt).toBeNull();
  });

  it('arms no reminder when the resume date is within the week', async () => {
    const user = await harness.signIn();
    await playTo(user, 'INITIAL_PURCHASE');
    await harness.run(user, 'set_pause_intent', { resume_at: inDays(30).toISOString() });
    const soon = inDays(3);
    const response = await harness.run(user, 'set_pause_intent', {
      resume_at: soon.toISOString(),
    });
    expect(resultOf(response)).toMatchObject({ remind_at: null });
    expect(await pauseOf(user.uid)).toMatchObject({ resumeAt: soon.toISOString(), timers: [] });
  });

  it('refuses a date in the past or more than a year out', async () => {
    const user = await harness.signIn();
    await playTo(user, 'INITIAL_PURCHASE');
    for (const days of [-1, 400]) {
      const response = await harness.run(user, 'set_pause_intent', {
        resume_at: inDays(days).toISOString(),
      });
      expect(errorOf(response)).toMatchObject({
        code: 'VALIDATION',
        detail: { reason: 'resume_at' },
      });
    }
    expect((await pauseOf(user.uid)).resumeAt).toBeNull();
  });

  it('refuses someone with no monthly App Store Pass+, and a Play subscriber', async () => {
    const free = await harness.signIn();
    const refused = await harness.run(free, 'set_pause_intent', {
      resume_at: inDays(60).toISOString(),
    });
    expect(errorOf(refused)).toMatchObject({
      code: 'NOT_ELIGIBLE',
      detail: { reason: 'no_pausable_plan' },
    });

    const onPlay = await harness.signIn();
    const [purchase] = loadFixture('pass-play-pause', onPlay.uid).steps;
    harness.revenuecat.set(onPlay.uid, purchase!.subscriber);
    await apply(harness, await storeEvent(harness, purchase!.webhook), new Date(purchase!.now));
    const play = await harness.run(onPlay, 'set_pause_intent', {
      resume_at: inDays(60).toISOString(),
    });
    expect(errorOf(play).code).toBe('NOT_ELIGIBLE');
    expect((await pauseOf(onPlay.uid)).resumeAt).toBeNull();
  });
});
