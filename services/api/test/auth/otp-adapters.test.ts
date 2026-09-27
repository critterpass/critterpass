/**
 * T4: WhatsApp/Twilio Verify/Prelude senders against recorded-shape provider responses
 * (code-standards.md §17 — test doubles only at the network boundary: `HttpClient.fetch` is faked,
 * everything else in each adapter is the real request-building/response-parsing code).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createPreludeSender } from '../../src/auth/otp/prelude';
import { createTwilioVerifySender } from '../../src/auth/otp/twilio-verify';
import { createWhatsAppSender, type HttpClient } from '../../src/auth/otp/whatsapp';

const FIXTURES_DIR = path.join(import.meta.dirname, '../fixtures/otp');

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

function fakeHttp(response: Response) {
  const fetch = vi.fn<HttpClient['fetch']>().mockResolvedValue(response);
  const http: HttpClient = { fetch };
  return { http, fetch };
}

describe('createWhatsAppSender', () => {
  it('sends the authentication template with the code and returns the provider message id', async () => {
    const { http, fetch } = fakeHttp(
      new Response(fixture('whatsapp-cloud-api-send-success.json'), { status: 200 }),
    );
    const sender = createWhatsAppSender({
      phoneNumberId: '106540352242922',
      accessToken: 'test-token',
      templateName: 'otp_login',
      languageCode: 'en_US',
      http,
    });

    const result = await sender.send({ phoneE164: '+6598765432', code: '123456' });

    expect(result.providerMessageId).toBe('wamid.HBgLNjU5ODc2NTQzMhUCABEYEjA1RUFEQUFERUFBRTAxRTAA');
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('106540352242922/messages');
    const body = JSON.parse(init.body as string) as {
      to: string;
      template: { name: string; components: Array<{ parameters: Array<{ text: string }> }> };
    };
    expect(body.to).toBe('+6598765432');
    expect(body.template.name).toBe('otp_login');
    expect(body.template.components[0]?.parameters[0]?.text).toBe('123456');
  });

  it('throws SUPPLIER_UNAVAILABLE on a non-2xx response (e.g. number not allowed in sandbox)', async () => {
    const { http } = fakeHttp(
      new Response(fixture('whatsapp-cloud-api-error.json'), { status: 400 }),
    );
    const sender = createWhatsAppSender({
      phoneNumberId: '106540352242922',
      accessToken: 'test-token',
      templateName: 'otp_login',
      languageCode: 'en_US',
      http,
    });
    await expect(sender.send({ phoneE164: '+6598765432', code: '123456' })).rejects.toMatchObject({
      code: 'SUPPLIER_UNAVAILABLE',
      detail: { channel: 'whatsapp' },
    });
  });
});

describe('createTwilioVerifySender', () => {
  it('sends the custom code via basic auth form POST', async () => {
    const { http, fetch } = fakeHttp(
      new Response(fixture('twilio-verify-send-success.json'), { status: 201 }),
    );
    const sender = createTwilioVerifySender({
      accountSid: 'ACexample',
      authToken: 'test-auth-token',
      serviceSid: 'VAexample',
      http,
    });

    await sender.send({ phoneE164: '+6598765432', code: '123456' });

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/Services/VAexample/Verifications');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toMatch(/^Basic /);
    const body = new URLSearchParams(init.body as string);
    expect(body.get('To')).toBe('+6598765432');
    expect(body.get('Channel')).toBe('sms');
    expect(body.get('CustomCode')).toBe('123456');
  });

  it('throws SUPPLIER_UNAVAILABLE when Custom Code is not enabled for the service', async () => {
    const { http } = fakeHttp(
      new Response(fixture('twilio-verify-error-invalid-parameter.json'), { status: 400 }),
    );
    const sender = createTwilioVerifySender({
      accountSid: 'ACexample',
      authToken: 'test-auth-token',
      serviceSid: 'VAexample',
      http,
    });
    await expect(sender.send({ phoneE164: '+6598765432', code: '123456' })).rejects.toMatchObject({
      code: 'SUPPLIER_UNAVAILABLE',
      detail: { channel: 'twilio_verify' },
    });
  });
});

describe('createPreludeSender', () => {
  it('sends the custom code as a phone_number target', async () => {
    const { http, fetch } = fakeHttp(
      new Response(fixture('prelude-verification-send-success.json'), { status: 201 }),
    );
    const sender = createPreludeSender({ apiKey: 'test-api-key', http });

    await sender.send({ phoneE164: '+84901234567', code: '654321' });

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/verification');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-api-key' });
    const body = JSON.parse(init.body as string) as {
      target: { type: string; value: string };
      custom_code: string;
    };
    expect(body.target).toEqual({ type: 'phone_number', value: '+84901234567' });
    expect(body.custom_code).toBe('654321');
  });

  it('throws SUPPLIER_UNAVAILABLE for an invalid target', async () => {
    const { http } = fakeHttp(
      new Response(fixture('prelude-error-invalid-target.json'), { status: 400 }),
    );
    const sender = createPreludeSender({ apiKey: 'test-api-key', http });
    await expect(sender.send({ phoneE164: '+84901234567', code: '654321' })).rejects.toMatchObject({
      code: 'SUPPLIER_UNAVAILABLE',
      detail: { channel: 'prelude' },
    });
  });
});
