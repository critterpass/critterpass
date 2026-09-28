import { describe, expect, it } from 'vitest';

import {
  jobPayloadRedactor,
  QUEUE_DESCRIPTIONS,
  QUEUES,
  queueSpec,
  redactJobPayload,
} from './catalogue';

describe('queue catalogue', () => {
  it('describes every catalogued queue and dead-letters push sends', () => {
    for (const name of Object.keys(QUEUES)) expect(QUEUE_DESCRIPTIONS[name], name).toBeTruthy();
    expect(queueSpec('push.send').deadLetter).toBe(true);
    expect(queueSpec('ops.ai_cost_guard').cron).toEqual({ expr: '*/5 * * * *', tz: 'UTC' });
    expect(() => queueSpec('nowhere.queue')).toThrow(/not in the queue catalogue/);
  });

  it('keeps ids and machine values, masks free text and shows a token by its last 4', () => {
    expect(
      redactJobPayload({
        notification_id: '0199a0f2-7c1e-7d4b-9a53-2f3c1d0e9b11',
        kind: 'leave_by',
        attempts: 2,
        device_token: 'aaaaaaaaaaaaaaaaaaaawxyz',
        body: 'Dinner at 7, bring the passport',
        nested: { apns_token: 'abc', list: ['ok', 'not ok at all'] },
      }),
    ).toEqual({
      notification_id: '0199a0f2-7c1e-7d4b-9a53-2f3c1d0e9b11',
      kind: 'leave_by',
      attempts: 2,
      device_token: '…wxyz',
      body: '[redacted]',
      nested: { apns_token: '…', list: ['ok', '[redacted]'] },
    });
    expect(jobPayloadRedactor('push.send.dlq')).toBe(redactJobPayload);
  });
});
