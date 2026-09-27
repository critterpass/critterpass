import { describe, expect, it, jest } from '@jest/globals';

import { sendOtp, verifyOtp, type SendOtpClient, type VerifyOtpClient } from '../otp';
import type { VerifyOtpOutcome } from '../types';

function fakeSendOtpClient(response: Awaited<ReturnType<SendOtpClient['sendOtp']>>) {
  const send = jest.fn<SendOtpClient['sendOtp']>().mockResolvedValue(response);
  const client: SendOtpClient = { sendOtp: send };
  return { client, send };
}

function fakeVerifyOtpClient(response: Awaited<ReturnType<VerifyOtpClient['verify']>>) {
  const verify = jest.fn<VerifyOtpClient['verify']>().mockResolvedValue(response);
  const client: VerifyOtpClient = { verify };
  return { client, verify };
}

describe('sendOtp', () => {
  it('returns sent on success', async () => {
    const { client } = fakeSendOtpClient({ data: {}, error: null });
    await expect(sendOtp('+6598765432', client)).resolves.toEqual({
      kind: 'sent',
      channel: 'whatsapp',
    });
  });

  it('returns country_unsupported for a blocked country', async () => {
    const { client } = fakeSendOtpClient({
      data: null,
      error: { detail: { reason: 'country_unsupported' } },
    });
    await expect(sendOtp('+000000', client)).resolves.toEqual({ kind: 'country_unsupported' });
  });

  it('returns rate_limited with retryAfterS', async () => {
    const { client } = fakeSendOtpClient({
      data: null,
      error: { status: 429, detail: { retry_after_s: 42 } },
    });
    await expect(sendOtp('+6598765432', client)).resolves.toEqual({
      kind: 'rate_limited',
      retryAfterS: 42,
    });
  });

  it('falls back to a generic error outcome', async () => {
    const { client } = fakeSendOtpClient({ data: null, error: { code: 'BOOM' } });
    await expect(sendOtp('+6598765432', client)).resolves.toEqual({ kind: 'error', code: 'BOOM' });
  });
});

describe('verifyOtp', () => {
  const input = { phoneNumber: '+6598765432', code: '123456' };

  it('returns verified on success', async () => {
    const { client, verify } = fakeVerifyOtpClient({ data: {}, error: null });
    await expect(verifyOtp(input, client)).resolves.toEqual({ kind: 'verified' });
    expect(verify).toHaveBeenCalledWith({ ...input, updatePhoneNumber: true });
  });

  it('returns merge_required with the ticket for a wrapped conflict', async () => {
    const { client } = fakeVerifyOtpClient({
      data: null,
      error: { error: { code: 'MERGE_REQUIRED', detail: { ticket: 'ticket-xyz' } } },
    });
    await expect(verifyOtp(input, client)).resolves.toEqual({
      kind: 'merge_required',
      ticket: 'ticket-xyz',
    });
  });

  const attemptCases: ReadonlyArray<{ code: string; expected: VerifyOtpOutcome }> = [
    { code: 'INVALID_OTP', expected: { kind: 'invalid_code' } },
    { code: 'OTP_EXPIRED', expected: { kind: 'expired_code' } },
    { code: 'TOO_MANY_ATTEMPTS', expected: { kind: 'too_many_attempts' } },
  ];
  it.each(attemptCases)('maps $code to $expected', async ({ code, expected }) => {
    const { client } = fakeVerifyOtpClient({ data: null, error: { code } });
    await expect(verifyOtp(input, client)).resolves.toEqual(expected);
  });

  it('falls back to a generic error outcome', async () => {
    const { client } = fakeVerifyOtpClient({ data: null, error: { code: 'BOOM' } });
    await expect(verifyOtp(input, client)).resolves.toEqual({ kind: 'error', code: 'BOOM' });
  });
});
