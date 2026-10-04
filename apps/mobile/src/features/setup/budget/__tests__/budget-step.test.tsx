/**
 * The budget step over the real local-first stack, with the api as the network boundary: below
 * four maxes nothing crew-level shows; above the band the check flips and LOOKS GOOD waits; a
 * rejected lock says nothing about how far off it was; a member's max is queued, then only
 * "Set ✓" shows, its value kept in `local_private` on their own device and nowhere on screen.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import type { SyncTransport } from '@/data/powersync/transport';

import { ALEX, DEV, JORDAN, MAYA, RIN, TRIP_ID, WINSTON } from '../../scenes/fixtures';
import { apiReads, K_ANON, renderBudget, seedBudget } from '../test-support/budget-harness';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

const SIX = [
  [JORDAN, 'Jordan'],
  [MAYA, 'Maya'],
  [ALEX, 'Alex'],
  [RIN, 'Rin'],
  [DEV, 'Dev'],
  [WINSTON, 'Winston'],
] as const;

const BANDED = {
  currency: 'USD',
  maxes_count: 6,
  member_count: 6,
  band_low_minor: 80_000,
  band_high_minor: 140_000,
  step_minor: 5_000,
  track_high_minor: 250_000,
  bucketed_dots: JSON.stringify([0.58, 0.62, 0.64, 0.7, 0.76, 0.86]),
  under_all_ok: 1,
  infeasible: 0,
};

/** `/v1/cmd/lock_budget_target` answering with an error envelope. */
function rejectingLock(code: string, detail: unknown, status: number): SyncTransport {
  return {
    postJson: () =>
      Promise.resolve({
        status,
        body: { error: { code, message: 'no', retryable: false, detail } },
      }),
  };
}

describe('organiser, below four maxes', () => {
  it('shows only the count: no band, no dots, no under-all check', async () => {
    stack = await openTestLocalFirst({ uid: WINSTON, holdUploads: true });
    await seedBudget(stack, {
      people: SIX.slice(3),
      aggregate: { currency: 'USD', maxes_count: 3, member_count: 3 },
    });
    await renderBudget(stack, apiReads({ '/v1/budget/': K_ANON }), { organiser: true });
    expect(await screen.findByText(/^3 of 3 set$/iu)).toBeTruthy();
    expect(screen.queryByText(/Under all/iu)).toBeNull();
    expect(screen.queryByTestId('budget-infeasible')).toBeNull();
  });

  it('promises a crew of three no band or dots: three can never be four', async () => {
    stack = await openTestLocalFirst({ uid: WINSTON, holdUploads: true });
    await seedBudget(stack, {
      people: SIX.slice(3),
      aggregate: { currency: 'USD', maxes_count: 1, member_count: 3 },
    });
    await renderBudget(stack, apiReads({ '/v1/budget/': K_ANON }), { organiser: true });
    expect(await screen.findByText(/^1 of 3 set$/iu)).toBeTruthy();
    expect(screen.queryByText(/four/iu, { includeHiddenElements: true })).toBeNull();
    expect(
      screen.getByText(/^every max stays private$/iu, { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.getByText(/^Pick what feels comfy for the crew\./u)).toBeTruthy();
  });

  it('tells a crew of six the band and dots come with the fourth max', async () => {
    stack = await openTestLocalFirst({ uid: WINSTON, holdUploads: true });
    await seedBudget(stack, {
      people: SIX,
      aggregate: { currency: 'USD', maxes_count: 3, member_count: 6 },
    });
    await renderBudget(stack, apiReads({ '/v1/budget/': K_ANON }), { organiser: true });
    expect(await screen.findByText(/^3 of 6 set$/iu)).toBeTruthy();
    expect(
      screen.getByText(/^dots appear from four maxes$/iu, { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.getByText(/The band shows once four are in\.$/u)).toBeTruthy();
  });
});

describe('organiser, from four maxes', () => {
  it('flips the check and holds LOOKS GOOD once the knob passes the band', async () => {
    stack = await openTestLocalFirst({ uid: WINSTON, holdUploads: true });
    await seedBudget(stack, { people: SIX, aggregate: BANDED });
    await renderBudget(stack, apiReads({ '/v1/budget/': K_ANON }), { organiser: true });
    expect(await screen.findByText(/^✓ Under all 6 maxes$/iu)).toBeTruthy();
    const track = screen.getByTestId('budget-track');
    for (let i = 0; i < 8; i += 1) {
      await fireEvent(track, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    }
    expect(await screen.findByText(/^Over someone’s max$/iu)).toBeTruthy();
    expect(screen.getByTestId('budget-lock').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('answers a rejected lock without a distance', async () => {
    stack = await openTestLocalFirst({
      uid: WINSTON,
      transport: rejectingLock('STATE_INVALID', { reason: 'over_band' }, 409),
    });
    await seedBudget(stack, { people: SIX, aggregate: BANDED });
    await renderBudget(stack, apiReads({ '/v1/budget/': K_ANON }), { organiser: true });
    await fireEvent.press(await screen.findByTestId('budget-lock'));
    const line = await screen.findByTestId('budget-lock-line');
    expect(line.props.children).toBe('That’s above someone’s max. Slide it down into the band.');
    expect(String(line.props.children)).not.toMatch(/\d/u);
  });
});

// Won has no step of its own: it is the round amount nearest $50, which needs a dollar rate.
describe('organiser of a crew settling in won', () => {
  const PAIR = SIX.slice(4);
  const WON_ONLY = [['EUR', 'KRW', '1480']] as const;
  const STEP = 50_000;
  const offStep = { reason: 'off_step', step_minor: STEP };

  /** `lock_budget_target` answering each send in turn (the last answer repeats). */
  function answering(answers: readonly { status: number; body: unknown }[]) {
    const targets: number[] = [];
    const transport: SyncTransport = {
      postJson: (_path, body) => {
        const sent = body as { payload: { target_minor: number } };
        targets.push(sent.payload.target_minor);
        const answer = answers[Math.min(targets.length, answers.length) - 1];
        return Promise.resolve(answer ?? { status: 500, body: null });
      },
    };
    return { targets, transport };
  }
  const refusal = (detail: unknown) => ({
    status: 422,
    body: { error: { code: 'VALIDATION', message: 'no', retryable: false, detail } },
  });
  const applied = { status: 200, body: { result: {} } };

  it('waits, priced, with no knob until the server has said the step', async () => {
    stack = await openTestLocalFirst({ uid: WINSTON, holdUploads: true });
    await seedBudget(stack, { people: PAIR, aggregate: null, currency: 'KRW', fx: WON_ONLY });
    const services = apiReads({});
    await renderBudget(
      stack,
      { ...services, getJson: () => new Promise(() => undefined) },
      { organiser: true },
    );
    expect(await screen.findByTestId('budget-bars-loading')).toBeTruthy();
    expect(screen.queryByTestId('budget-track')).toBeNull();
    // Still none once the synced rows have had time to be read: only the server's answer brings it.
    await act(() => new Promise((resolve) => setTimeout(resolve, 750)));
    expect(screen.queryByTestId('budget-track')).toBeNull();
    expect(screen.getByTestId('budget-bars-loading')).toBeTruthy();
    expect(screen.getByTestId('budget-lock').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('locks on the step the band read hands out below four maxes', async () => {
    const { targets, transport } = answering([applied]);
    stack = await openTestLocalFirst({ uid: WINSTON, transport });
    await seedBudget(stack, { people: PAIR, aggregate: null, currency: 'KRW', fx: WON_ONLY });
    const detail = { maxes_count: 0, member_count: 2, currency: 'KRW', step_minor: STEP };
    await renderBudget(
      stack,
      apiReads({
        '/v1/budget/': { kind: 'error', status: 409, code: 'K_ANON_UNAVAILABLE', detail },
      }),
      { organiser: true },
    );
    await screen.findByTestId('budget-track');
    await fireEvent.press(screen.getByTestId('budget-lock'));
    await waitFor(() => expect(targets).toHaveLength(1));
    expect(targets[0]).toBeGreaterThan(0);
    expect((targets[0] ?? 1) % STEP).toBe(0);
  });

  it('works the step out from the newest rate of each currency when a day is only part in', async () => {
    const { targets, transport } = answering([applied]);
    stack = await openTestLocalFirst({ uid: WINSTON, transport });
    await seedBudget(stack, {
      people: PAIR,
      aggregate: null,
      currency: 'KRW',
      fx: [...WON_ONLY, ['EUR', 'USD', '1.25']],
    });
    // The next day's rows so far: the dollar alone.
    await stack.db.execute(
      `INSERT INTO fx_snapshots (id, base, quote, rate, as_of, source)
       VALUES ('fx-next-day', 'EUR', 'USD', '1.25', '2027-03-02', 'frankfurter')`,
    );
    await renderBudget(stack, apiReads({ '/v1/budget/': K_ANON }), { organiser: true });
    await screen.findByTestId('budget-track');
    await fireEvent.press(screen.getByTestId('budget-lock'));
    await waitFor(() => expect(targets).toHaveLength(1));
    // $50 is ₩59,200 at these rates, so the step is ₩50,000: not a dollar-sized grid.
    expect(targets[0]).toBeGreaterThanOrEqual(STEP);
    expect((targets[0] ?? 1) % STEP).toBe(0);
  });

  it('says the rate is not in yet when the server has no rate to lock with', async () => {
    const { transport } = answering([
      {
        status: 409,
        body: {
          error: {
            code: 'STATE_INVALID',
            message: 'no',
            retryable: false,
            detail: { reason: 'rates_unavailable' },
          },
        },
      },
    ]);
    stack = await openTestLocalFirst({ uid: WINSTON, transport });
    await seedBudget(stack, { people: PAIR, aggregate: null, currency: 'KRW', fx: WON_ONLY });
    await renderBudget(stack, apiReads({ '/v1/budget/': K_ANON }), { organiser: true });
    await screen.findByTestId('budget-track');
    await fireEvent.press(screen.getByTestId('budget-lock'));
    const line = await screen.findByTestId('budget-lock-line');
    expect(String(line.props.children)).toMatch(/rate for your crew’s currency isn’t in yet/u);
  });

  it('takes up the step a refused lock answers with and sends it once more', async () => {
    const { targets, transport } = answering([refusal(offStep), applied]);
    stack = await openTestLocalFirst({ uid: WINSTON, transport });
    await seedBudget(stack, { people: PAIR, aggregate: null, currency: 'KRW', fx: WON_ONLY });
    await renderBudget(stack, apiReads({ '/v1/budget/': K_ANON }), { organiser: true });
    await screen.findByTestId('budget-track');
    await fireEvent.press(screen.getByTestId('budget-lock'));
    await waitFor(() => expect(targets).toHaveLength(2));
    expect((targets[0] ?? 0) % STEP).not.toBe(0);
    expect(targets[1]).toBeGreaterThan(0);
    expect((targets[1] ?? 1) % STEP).toBe(0);
    await waitFor(() =>
      expect(screen.getByTestId('budget-lock').props.accessibilityState).not.toMatchObject({
        busy: true,
      }),
    );
    expect(screen.queryByTestId('budget-lock-line')).toBeNull();
  });

  it('shows the failed line only when the second send is refused too', async () => {
    const { targets, transport } = answering([refusal(offStep)]);
    stack = await openTestLocalFirst({ uid: WINSTON, transport });
    await seedBudget(stack, { people: PAIR, aggregate: null, currency: 'KRW', fx: WON_ONLY });
    await renderBudget(stack, apiReads({ '/v1/budget/': K_ANON }), { organiser: true });
    await screen.findByTestId('budget-track');
    await fireEvent.press(screen.getByTestId('budget-lock'));
    const line = await screen.findByTestId('budget-lock-line');
    expect(line.props.children).toBe('That didn’t lock. Try again.');
    expect(targets).toHaveLength(2);
  });
});

describe('the knob before the organiser touches it', () => {
  it('follows the suggested start when prices arrive after the step is on screen', async () => {
    stack = await openTestLocalFirst({ uid: WINSTON, holdUploads: true });
    await seedBudget(stack, {
      people: SIX.slice(4),
      aggregate: { currency: 'USD', maxes_count: 0, member_count: 2 },
    });
    await stack.db.execute(
      "UPDATE trips SET start_date = '2027-04-02', end_date = '2027-04-04' WHERE id = ?",
      [TRIP_ID],
    );
    await renderBudget(stack, apiReads({ '/v1/budget/': K_ANON }), { organiser: true });
    // Nothing priced yet: a third along the sixty-step track.
    const track = await screen.findByTestId('budget-track');
    expect(track.props.accessibilityValue).toEqual({ text: '$1,000' });
    // The destination's cost index syncs: 2 nights at $40 + 3 days at $45 = $215 at the least,
    // so the track runs $200 to $500 and the start is a third along it, not pinned to its end.
    await stack.db.execute("UPDATE trips SET destination_id = 'dest-1' WHERE id = ?", [TRIP_ID]);
    await stack.db.execute(
      `INSERT INTO destination_cost_indices (id, destination_id, stay_type, nightly_minor_low,
         nightly_minor_high, food_pp_day_minor, fun_pp_day_minor, currency, reviewed_at)
       VALUES ('ci-1', 'dest-1', 'hotel', 4000, 6000, 3000, 1500, 'USD', '2027-01-01')`,
    );
    await waitFor(() =>
      expect(screen.getByTestId('budget-track').props.accessibilityValue).toEqual({
        text: '$300',
      }),
    );
  });
});

describe('member', () => {
  it('queues the max, then shows only Set ✓ with the value on this device alone', async () => {
    stack = await openTestLocalFirst({ uid: DEV, holdUploads: true });
    await seedBudget(stack, { people: SIX, aggregate: BANDED });
    await renderBudget(stack, apiReads({}), { organiser: false });
    await screen.findByTestId('budget-member-entry');
    for (const key of ['1', '5', '0', '0']) await fireEvent.press(screen.getByLabelText(key));
    await fireEvent.press(screen.getByTestId('budget-member-save'));

    expect(await screen.findByTestId('budget-member-set-mark')).toBeTruthy();
    const queued = await stack.db.getAll<{ cmd: string }>(
      "SELECT cmd FROM commands WHERE cmd = 'submit_budget_max'",
    );
    expect(queued).toHaveLength(1);
    await waitFor(async () => {
      const own = await stack!.db.getAll<{ data: string }>('SELECT data FROM local_private');
      expect(JSON.parse(own[0]?.data ?? '{}')).toEqual({ amount_minor: 150_000, currency: 'USD' });
    });
    expect(screen.queryByText(/1,500|1500/u)).toBeNull();
  });

  it('never renders a max on the organiser’s view', async () => {
    stack = await openTestLocalFirst({ uid: WINSTON, holdUploads: true });
    await seedBudget(stack, { people: SIX, aggregate: BANDED });
    await stack.db.execute(
      'INSERT INTO local_private (id, kind, data, fetched_at) VALUES (?, ?, ?, ?)',
      ['budget_max:other', 'budget_max', '{"amount_minor":123400,"currency":"USD"}', 'now'],
    );
    await renderBudget(stack, apiReads({ '/v1/budget/': K_ANON }), { organiser: true });
    expect(await screen.findByText(/^✓ Under all 6 maxes$/iu)).toBeTruthy();
    expect(screen.queryByText(/1,234/u)).toBeNull();
    expect(screen.getByTestId('budget-own-max')).toBeTruthy();
  });
});
