/**
 * The purge reminder as an e-mail: the request the provider gets (Resend's documented shapes,
 * test/fixtures/account-purge/resend-*.json), plain text with no tracking, the copy in the
 * account's language, and no sender unless the environment names one.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createResendSender,
  emailSenderFromEnv,
  EmailSendError,
} from '../../src/jobs/account/email-sender';
import { purgeReminderCopy } from '../../src/jobs/account/purge-reminder-copy';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/account-purge/${name}`, import.meta.url), 'utf8');

const PURGE_AT = new Date('2026-11-05T09:30:00Z');

function provider(refuse = false) {
  const requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const send: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({
      url: request.url,
      headers: request.headers,
      body: (await request.json()) as Record<string, unknown>,
    });
    return refuse
      ? new Response(fixture('resend-email-refused.json'), { status: 403 })
      : new Response(fixture('resend-email-sent.json'), { status: 200 });
  };
  return { requests, send };
}

describe('purge reminder e-mail', () => {
  it('hands the provider one plain-text message with an idempotency key and no tracking', async () => {
    const { requests, send } = provider();
    const sender = createResendSender({
      apiKey: 're_test',
      from: 'CritterPass <hello@mail.example.com>',
      fetch: send,
    });
    await sender.send({
      to: 'mai@example.com',
      ...purgeReminderCopy('en', PURGE_AT),
      idempotencyKey: 'purge-reminder/0199b7d0-1111-7222-8333-444455556666',
    });
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe('https://api.resend.com/emails');
    expect(request?.headers.get('authorization')).toBe('Bearer re_test');
    expect(request?.headers.get('idempotency-key')).toBe(
      'purge-reminder/0199b7d0-1111-7222-8333-444455556666',
    );
    expect(Object.keys(request?.body ?? {}).sort()).toEqual(['from', 'subject', 'text', 'to']);
    expect(request?.body).toMatchObject({
      from: 'CritterPass <hello@mail.example.com>',
      to: ['mai@example.com'],
      subject: 'Your CritterPass account will be deleted on 5 November 2026',
    });
    expect(String(request?.body['text'])).not.toMatch(/https?:|<[a-z]/i);
  });

  it('fails when the provider refuses', async () => {
    const { send } = provider(true);
    const sender = createResendSender({ apiKey: 're_test', from: 'a@example.com', fetch: send });
    await expect(
      sender.send({ to: 'mai@example.com', subject: 's', text: 't', idempotencyKey: 'k' }),
    ).rejects.toBeInstanceOf(EmailSendError);
  });

  it('writes the reminder in Vietnamese for a Vietnamese account, English otherwise', () => {
    const vi = purgeReminderCopy('vi-VN', PURGE_AT);
    expect(vi.subject).toBe('Tài khoản CritterPass của bạn sẽ bị xoá vào 5 tháng 11, 2026');
    expect(vi.text).toContain('đăng nhập trước ngày đó');
    for (const locale of [null, 'en', 'ja']) {
      expect(purgeReminderCopy(locale, PURGE_AT).text).toContain('sign in before then');
    }
  });

  it('has no sender unless both the key and the from-address are set', () => {
    expect(emailSenderFromEnv({})).toBeNull();
    expect(emailSenderFromEnv({ RESEND_API_KEY: 're_test' })).toBeNull();
    expect(emailSenderFromEnv({ EMAIL_FROM: 'a@example.com' })).toBeNull();
    expect(
      emailSenderFromEnv({ RESEND_API_KEY: 're_test', EMAIL_FROM: 'a@example.com' }),
    ).not.toBeNull();
  });
});
