import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { buildSosModel, senderBubble, type SosRow } from '../sos/sos-model';
import { smsUrl } from '../sos/sms-fallback';
import { useCountdown } from '../sos/use-countdown';

const SENDER = 'u-jordan';
const ALEX = 'u-alex';
const MAYA = 'u-maya';
const names = new Map([
  [SENDER, 'Jordan'],
  [ALEX, 'Alex'],
  [MAYA, 'Maya'],
]);

const row = (over: Partial<SosRow> = {}): SosRow => ({
  id: 'sos-1',
  trip_id: 'trip-1',
  user_id: SENDER,
  status: 'open',
  preset: 'fell',
  body: 'came off the scooter',
  summary: null,
  responder_ids: '[]',
  responses: '{}',
  steps: JSON.stringify({ sent: { state: 'done', n: 5 } }),
  alerted_count: 5,
  escalated_at: null,
  false_alarm: 0,
  opened_at: '2026-10-02T09:42:00Z',
  resolved_at: null,
  ...over,
});

describe('SOS model', () => {
  it('waits (the dot blinks) until someone is coming, then lists them nearest first', () => {
    expect(buildSosModel(row(), MAYA, names)).toMatchObject({ role: 'crew', waiting: true });
    const responses = JSON.stringify({
      [MAYA]: { state: 'seen', at: '2026-10-02T09:43:00Z' },
      [ALEX]: { state: 'coming', at: '2026-10-02T09:43:00Z', eta_min: 4 },
    });
    const model = buildSosModel(row({ status: 'responding', responses }), MAYA, names);
    expect(model.waiting).toBe(false);
    expect(model.seen).toBe(2);
    expect(model.responders).toEqual([{ uid: ALEX, name: 'Alex', etaMin: 4, arrived: false }]);
    expect(model.myResponse).toBe('seen');
  });

  it('shows the sender their own status, and the call prompt only after the escalation', () => {
    expect(buildSosModel(row(), SENDER, names)).toMatchObject({ role: 'sender', escalated: false });
    const late = buildSosModel(row({ escalated_at: '2026-10-02T09:44:00Z' }), SENDER, names);
    expect(late.escalated).toBe(true);
  });

  it('ticks a step only on its real event, and lists the clinic and insurance only once asked', () => {
    const steps = buildSosModel(row(), MAYA, names).steps;
    expect(steps.map((s) => [s.key, s.done, s.n])).toEqual([
      ['sent', true, 5],
      ['location_live', true, null],
    ]);
    const asked = JSON.stringify({
      sent: { state: 'done', n: 5 },
      ops_clinic: { state: 'pending' },
    });
    expect(buildSosModel(row({ steps: asked }), MAYA, names, true).steps.map((s) => s.key)).toEqual(
      ['sent', 'location_live', 'ops_clinic'],
    );
  });

  it('never shows a desk call or insurance hand-off where nobody staffs the desk', () => {
    const asked = JSON.stringify({
      sent: { state: 'done', n: 5 },
      ops_clinic: { state: 'pending' },
      insurance: { state: 'pending' },
    });
    expect(
      buildSosModel(row({ steps: asked }), MAYA, names, false).steps.map((s) => s.key),
    ).toEqual(['sent', 'location_live']);
  });

  it('reads a resolved false alarm and a stale SOS as such', () => {
    const resolved = row({
      status: 'resolved',
      false_alarm: 1,
      resolved_at: '2026-10-02T09:50:00Z',
    });
    expect(buildSosModel(resolved, MAYA, names).steps.map((s) => s.key)).toEqual(['sent']);
    expect(buildSosModel(resolved, MAYA, names)).toMatchObject({
      state: 'resolved',
      falseAlarm: true,
    });
    expect(buildSosModel(row({ status: 'stale' }), SENDER, names).state).toBe('stale');
  });
});

describe('SOS cancel window', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends nothing when cancelled within five seconds, and once when it runs out', async () => {
    const send = jest.fn();
    const tick = jest.fn();
    const { result } = await renderHook(() => useCountdown(send, 5, tick));
    await act(() => result.current.start());
    await act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(result.current.left).toBe(1);
    await act(() => result.current.cancel());
    await act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(send).not.toHaveBeenCalled();
    expect(result.current.left).toBeNull();

    await act(() => result.current.start());
    await act(() => {
      jest.advanceTimersByTime(5000);
    });
    await act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledTimes(5 + 5);
  });
});

describe('SOS with no data', () => {
  it('prefills the message composer to the crew on both platforms', () => {
    const draft = { numbers: ['+84 90 123 4567', '+65 6812-3456'], body: 'SOS: here' };
    expect(smsUrl(draft, 'ios')).toBe(
      'sms:/open?addresses=+84901234567,+6568123456&body=SOS%3A%20here',
    );
    expect(smsUrl(draft, 'android')).toBe('sms:+84901234567;+6568123456?body=SOS%3A%20here');
  });
});

describe('SOS that reached nobody', () => {
  const sent = (n: number) => JSON.stringify({ sent: { state: 'done', n } });

  it('says so to a sender alone on the trip, and never counts "all 0 of you"', () => {
    const alone = buildSosModel(row({ steps: sent(0), alerted_count: 0 }), SENDER, names);
    expect(alone.reachedNobody).toBe(true);
    expect(alone.steps[0]).toMatchObject({ key: 'sent', done: true, n: 0 });
  });

  it('counts one crewmate and more as reached, and waits while the fan-out runs', () => {
    expect(
      buildSosModel(row({ steps: sent(1), alerted_count: 1 }), SENDER, names).reachedNobody,
    ).toBe(false);
    expect(buildSosModel(row({ steps: sent(5) }), SENDER, names).reachedNobody).toBe(false);
    expect(buildSosModel(row({ steps: '{}', alerted_count: 0 }), SENDER, names).reachedNobody).toBe(
      false,
    );
  });
});

describe("the sender's own words under the summary", () => {
  const sent = { id: 'sos-1', user_id: SENDER, body: null, opened_at: '2026-10-02T09:42:00Z' };

  it('shows the picked preset when the line above is the guide summary', () => {
    expect(senderBubble(null, sent, 'Jordan had a fall.', 'I fell')?.body).toBe('I fell');
  });

  it('prefers their latest message, and never repeats the line already shown', () => {
    const latest = {
      id: 'm-1',
      sender_id: SENDER,
      body: 'knee is scraped',
      at: '2026-10-02T09:43:00Z',
    };
    expect(senderBubble(latest, sent, 'Jordan had a fall.', 'I fell')).toBe(latest);
    expect(
      senderBubble(null, { ...sent, body: 'came off the scooter' }, 'came off the scooter', ''),
    ).toBeNull();
    expect(senderBubble(null, sent, null, '')).toBeNull();
  });
});
