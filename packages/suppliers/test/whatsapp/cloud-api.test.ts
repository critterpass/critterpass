/**
 * The desk's WhatsApp Cloud API client and webhook on Meta's published samples: a text goes as a
 * plain message and outside the service window inside the approved template; a webhook is accepted
 * only with the app secret's signature over the exact body, and parses into replies and statuses.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createSupplierHttp } from '../../src/core/http';
import { createWhatsAppBusinessClient, waRecipient } from '../../src/whatsapp/client';
import { parseWhatsAppWebhook, verifyWhatsAppSignature } from '../../src/whatsapp/webhook-verify';
import { recordedFetch } from '../helpers/recorded-fetch';

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures');
const read = (file: string) => readFileSync(path.join(FIXTURES, file), 'utf8');

function client() {
  const recorded = recordedFetch(FIXTURES, [
    { path: '/v21.0/106540352242922/messages', file: 'messages-send-published-sample.json' },
  ]);
  const http = createSupplierHttp({ fetch: recorded.fetch, audit: () => Promise.resolve() });
  return {
    whatsapp: createWhatsAppBusinessClient(http, {
      phoneNumberId: '106540352242922',
      accessToken: 'token',
    }),
    requests: recorded.requests,
  };
}

describe('whatsapp business client', () => {
  it('sends free text within the window and the approved template outside it, once each', async () => {
    const { whatsapp, requests } = client();
    const text = await whatsapp.sendText('+62 812-3456-7890', 'Table for 6 at 21:00?');
    const template = await whatsapp.sendTemplate('+6281234567890', 'Table for 6 at 21:00?');
    expect(text).toEqual({
      waMessageId: 'wamid.HBgLMTY1MDUwNzY1MjAVAgARGBI5QTNDQTVCM0Q0Q0Q2RTY3RTcA',
      templateName: null,
    });
    expect(template.templateName).toBe('traveller_request');
    expect(requests).toHaveLength(2);
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer token');
    expect(JSON.parse(requests[0]?.body ?? '{}')).toMatchObject({
      messaging_product: 'whatsapp',
      to: '6281234567890',
      type: 'text',
      text: { body: 'Table for 6 at 21:00?' },
    });
    expect(JSON.parse(requests[1]?.body ?? '{}')).toMatchObject({
      type: 'template',
      template: {
        name: 'traveller_request',
        components: [
          { type: 'body', parameters: [{ type: 'text', text: 'Table for 6 at 21:00?' }] },
        ],
      },
    });
  });

  it('refuses a recipient that is not a phone number', () => {
    expect(() => waRecipient('not a number')).toThrow();
  });
});

describe('whatsapp webhook', () => {
  const body = read('webhook-text-message-published-sample.json');
  const sign = (secret: string, raw: string) =>
    `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

  it('accepts only the app secret signature over the exact body', () => {
    expect(verifyWhatsAppSignature('secret', body, sign('secret', body))).toBe(true);
    expect(verifyWhatsAppSignature('secret', body, sign('other', body))).toBe(false);
    expect(verifyWhatsAppSignature('secret', `${body} `, sign('secret', body))).toBe(false);
    expect(verifyWhatsAppSignature('secret', body, undefined)).toBe(false);
    expect(verifyWhatsAppSignature('secret', body, 'sha256=zz')).toBe(false);
  });

  it('parses replies and statuses', () => {
    expect(parseWhatsAppWebhook(body)).toEqual({
      phoneNumberId: '106540352242922',
      messages: [
        {
          from: '6281234567890',
          waMessageId: 'wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=',
          at: new Date(1_791_700_000_000),
          text: 'ok 13:50 bisa',
          type: 'text',
        },
      ],
      statuses: [],
    });
    const status = parseWhatsAppWebhook(read('webhook-status-delivered-published-sample.json'));
    expect(status?.statuses).toEqual([
      {
        waMessageId: 'wamid.HBgLMTY1MDUwNzY1MjAVAgARGBI5QTNDQTVCM0Q0Q0Q2RTY3RTcA',
        status: 'delivered',
        at: new Date(1_791_699_000_000),
        errorCode: null,
      },
    ]);
    expect(parseWhatsAppWebhook('{"object":"page","entry":[]}')).toBeNull();
    expect(parseWhatsAppWebhook('not json')).toBeNull();
  });
});
