import { describe, expect, it } from 'vitest';

import {
  findUnsafeLink,
  isReactionEmoji,
  reactMessagePayloadSchema,
  sendMessagePayloadSchema,
} from '..';

const crew = '0192f000-0000-7000-8000-000000000001';

describe('findUnsafeLink', () => {
  it('allows http and https links and plain text with colons', () => {
    expect(findUnsafeLink('see https://example.com and http://a.b/c at 14:00')).toBeNull();
    expect(findUnsafeLink('ratio 3:2, note: bring cash')).toBeNull();
  });

  it('flags script, data and file schemes and any other scheme with slashes', () => {
    expect(findUnsafeLink('tap javascript:alert(1)')).toBe('javascript');
    expect(findUnsafeLink('DATA:text/html;base64,xx')).toBe('data');
    expect(findUnsafeLink('ftp://host/file')).toBe('ftp');
    expect(findUnsafeLink('file:///etc/passwd')).toBe('file');
  });
});

describe('sendMessagePayloadSchema', () => {
  it('trims the body and refuses an empty message without attachments', () => {
    expect(sendMessagePayloadSchema.parse({ crew_id: crew, body: '  hi \r\n' }).body).toBe('hi');
    expect(sendMessagePayloadSchema.safeParse({ crew_id: crew, body: '   ' }).success).toBe(false);
  });

  it('refuses a body over 4000 characters and more than ten attachments', () => {
    expect(
      sendMessagePayloadSchema.safeParse({ crew_id: crew, body: 'x'.repeat(4001) }).success,
    ).toBe(false);
    const photo = { media_key: 'k', kind: 'photo' as const };
    expect(
      sendMessagePayloadSchema.safeParse({ crew_id: crew, attachments: Array(11).fill(photo) })
        .success,
    ).toBe(false);
  });

  it('takes one voice note with a duration of at most two minutes, alone', () => {
    const voice = { media_key: 'k', kind: 'voice' as const, duration_ms: 5000 };
    expect(
      sendMessagePayloadSchema.safeParse({ crew_id: crew, attachments: [voice] }).success,
    ).toBe(true);
    expect(
      sendMessagePayloadSchema.safeParse({
        crew_id: crew,
        attachments: [{ ...voice, duration_ms: 120_001 }],
      }).success,
    ).toBe(false);
    expect(
      sendMessagePayloadSchema.safeParse({
        crew_id: crew,
        attachments: [voice, { media_key: 'p', kind: 'photo' }],
      }).success,
    ).toBe(false);
  });
});

describe('reactions', () => {
  it('accepts emoji and refuses words', () => {
    expect(isReactionEmoji('🔥')).toBe(true);
    expect(isReactionEmoji('🇻🇳')).toBe(true);
    expect(isReactionEmoji('lol')).toBe(false);
    expect(reactMessagePayloadSchema.safeParse({ message_id: crew, emoji: 'ok ok' }).success).toBe(
      false,
    );
  });
});
