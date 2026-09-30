/**
 * Partner links: the click is recorded before anything opens, the link goes out on this build's
 * own `go.` host, an offline tap still opens the bridge, and a partner that isn't set up opens
 * nothing. The catalogue's English matches the copy rules word for word.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

import { describe, expect, it, jest } from '@jest/globals';

import { SUB_ID_PATTERN, SUPPLIER_COPY_EN, type RecordSupplierClickPayload } from '@cp/domain';

import type { SendResult } from '@/data/commands/client';

import { SUPPLIER_COPY_MESSAGES } from '../copy';
import {
  openPartnerLink,
  partnerBridgeUrl,
  subIdFrom,
  type PartnerLinkDeps,
} from '../data/partner-link';
import { remainingLabel } from '../HoldTimer';
import { parsePaymentMessage } from '../PaymentWebView';

function deps(online: SendResult, queued: SendResult = { kind: 'queued', opId: 'q' }) {
  const log: string[] = [];
  const sent: RecordSupplierClickPayload[] = [];
  const value: PartnerLinkDeps = {
    env: 'staging',
    randomBytes: (count) => Uint8Array.from({ length: count }, (_, i) => i * 13),
    sendOnline: (payload) => {
      log.push('online');
      sent.push(payload);
      return Promise.resolve(online);
    },
    sendQueued: () => {
      log.push('queued');
      return Promise.resolve(queued);
    },
    waitForUpload: () => {
      log.push('wait');
      return Promise.resolve();
    },
    openUrl: (url) => {
      log.push(`open ${url}`);
      return Promise.resolve();
    },
  };
  return { value, log, sent };
}

const REQUEST = {
  partner: 'klook',
  tripId: '018f0000-0000-7000-8000-000000000001',
  target: { kind: 'activity', ref: 'batur', query: 'Mount Batur sunrise trek' },
} as const;

describe('partner links', () => {
  it('records the click, then opens the bridge on the staging go host', async () => {
    const { value, log, sent } = deps({ kind: 'applied', opId: 'o', result: {} });
    await expect(openPartnerLink(value, REQUEST)).resolves.toBe('opened');
    const subId = sent[0]?.sub_id ?? '';
    expect(subId).toMatch(SUB_ID_PATTERN);
    expect(log).toEqual(['online', `open https://go.staging.critterpass.app/out/${subId}`]);
    expect(sent[0]).toMatchObject({
      partner: 'klook',
      trip_id: REQUEST.tripId,
      target: REQUEST.target,
    });
  });

  it('queues the click and still opens the bridge without signal', async () => {
    const { value, log } = deps({ kind: 'unavailable', opId: 'o', code: 'NETWORK' });
    await expect(openPartnerLink(value, REQUEST)).resolves.toBe('opened_offline');
    expect(log.slice(0, 3)).toEqual(['online', 'queued', 'wait']);
    expect(log[3]).toMatch(/^open https:\/\/go\.staging\.critterpass\.app\/out\//u);
  });

  it('opens nothing when the partner is not set up or the api refuses the click', async () => {
    const off = deps({ kind: 'unavailable', opId: 'o', code: 'SUPPLIER_UNAVAILABLE' });
    await expect(openPartnerLink(off.value, REQUEST)).resolves.toBe('unavailable');
    expect(off.log).toEqual(['online']);
    const refused = deps({ kind: 'rejected', opId: 'o', code: 'NOT_FOUND' });
    await expect(openPartnerLink(refused.value, REQUEST)).resolves.toBe('failed');
    expect(refused.log).toEqual(['online']);
  });

  it('builds each environment its own host', () => {
    const subId = subIdFrom(new Uint8Array(20));
    expect(partnerBridgeUrl(subId, 'production')).toBe(`https://go.critterpass.app/out/${subId}`);
    expect(partnerBridgeUrl(subId, 'development')).toBe(
      `https://go.staging.critterpass.app/out/${subId}`,
    );
  });
});

describe('supplier copy catalogue', () => {
  it('matches the copy rules in English for every key', () => {
    for (const [key, message] of Object.entries(SUPPLIER_COPY_EN)) {
      expect(SUPPLIER_COPY_MESSAGES[key as keyof typeof SUPPLIER_COPY_EN].message).toBe(message);
    }
  });
});

describe('holds and payment', () => {
  it('counts down to the supplier deadline and stops at zero', () => {
    expect(remainingLabel(125_000, 0)).toBe('2:05');
    expect(remainingLabel(3_725_000, 0)).toBe('1:02:05');
    expect(remainingLabel(1000, 1000)).toBeNull();
  });

  it('books only on a paid message with a token', () => {
    expect(parsePaymentMessage('{"status":"paid","payment_session_ref":"tok"}')).toEqual({
      status: 'paid',
      paymentSessionRef: 'tok',
    });
    expect(parsePaymentMessage('{"status":"paid"}')).toEqual({ status: 'failed' });
    expect(parsePaymentMessage('{"status":"cancelled"}')).toEqual({ status: 'cancelled' });
    expect(parsePaymentMessage('not json')).toEqual({ status: 'failed' });
  });
});
