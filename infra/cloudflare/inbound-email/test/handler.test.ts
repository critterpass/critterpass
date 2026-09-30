import { describe, expect, it } from 'vitest';

import {
  handleInbound,
  MAX_RAW_BYTES,
  senderVerdicts,
  signBody,
  type InboundEnv,
  type InboundMessage,
} from '../src/handler';

const RAW = [
  'From: Maya Tan <maya@example.com>',
  'To: bali-six@in.critterpass.app',
  'Subject: Fwd: Your booking is confirmed',
  'Message-ID: <abc123@mail.example.com>',
  '',
  'Booking ID 1234567890',
].join('\r\n');

function message(overrides: Partial<{ to: string; rawSize: number; auth: string }> = {}) {
  const rejected: string[] = [];
  const headers = new Headers({
    'message-id': '<abc123@mail.example.com>',
    subject: 'Fwd: Your booking is confirmed',
    'authentication-results':
      overrides.auth ??
      'mx.cloudflare.net; dkim=pass header.d=example.com; spf=pass smtp.mailfrom=example.com; dmarc=pass',
  });
  const value: InboundMessage = {
    from: 'maya@example.com',
    to: overrides.to ?? 'Bali-Six@in.critterpass.app',
    headers,
    raw: new Response(RAW).body as ReadableStream<Uint8Array>,
    rawSize: overrides.rawSize ?? RAW.length,
    setReject: (reason: string) => {
      rejected.push(reason);
    },
  };
  return { value, rejected };
}

function world(answer: unknown, status = 200) {
  const stored: string[] = [];
  const posts: { url: string; headers: Headers; body: string }[] = [];
  const replies: string[] = [];
  const forwards: string[] = [];
  const env: InboundEnv = {
    RAW_MAIL: {
      put: (key: string) => {
        stored.push(key);
        return Promise.resolve(null);
      },
    },
    INBOUND_DOMAIN: 'in.critterpass.app',
    API_BASE_URL: 'https://api.test/',
    IMPORTS_MAIL_ENABLED: 'true',
    INBOUND_EMAIL_HMAC_SECRET: 'shared-secret-for-tests-only-0123456789',
  };
  let id = 0;
  const deps = {
    fetch: (url: string, init: RequestInit & { body: string }) => {
      posts.push({ url, headers: new Headers(init.headers), body: init.body });
      return Promise.resolve(new Response(JSON.stringify(answer), { status }));
    },
    now: () => new Date('2026-09-30T03:00:00Z'),
    newId: () => `id-${(id += 1)}`,
    reply: (raw: string) => {
      replies.push(raw);
      return Promise.resolve();
    },
    forward: (to: string) => {
      forwards.push(to);
      return Promise.resolve();
    },
  };
  return {
    env,
    deps: deps as unknown as Parameters<typeof handleInbound>[2],
    stored,
    posts,
    replies,
    forwards,
  };
}

describe('inbound email', () => {
  it('stores the raw mail and posts signed metadata, never the body', async () => {
    const { env, deps, stored, posts } = world({ action: 'accepted' });
    const { value, rejected } = message();
    expect(await handleInbound(value, env, deps)).toBe('accepted');
    expect(rejected).toEqual([]);
    expect(stored).toEqual(['inbound/2026-09-30/id-1.eml']);
    const [post] = posts;
    expect(post?.url).toBe('https://api.test/webhooks/inbound-email');
    const body = JSON.parse(post?.body ?? '{}') as Record<string, unknown>;
    expect(body).toMatchObject({
      local_part: 'bali-six',
      from: 'maya@example.com',
      message_id: '<abc123@mail.example.com>',
      r2_key: 'inbound/2026-09-30/id-1.eml',
      dkim: 'pass',
      spf: 'pass',
    });
    expect(post?.body).not.toContain('1234567890');
    const timestamp = post?.headers.get('x-cp-timestamp') ?? '';
    expect(post?.headers.get('x-cp-signature')).toBe(
      await signBody(env.INBOUND_EMAIL_HMAC_SECRET, timestamp, post?.body ?? ''),
    );
  });

  it('sends the link-code reply for a quarantined sender, threaded under their mail', async () => {
    const { env, deps, replies } = world({
      action: 'quarantined',
      reply: { subject: 'Link this email to CritterPass', text: 'Enter 482913 in the app.' },
    });
    expect(await handleInbound(message().value, env, deps)).toBe('quarantined');
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('In-Reply-To: <abc123@mail.example.com>');
    expect(replies[0]).toContain('To: maya@example.com');
    expect(atob((replies[0] ?? '').split('\r\n\r\n')[1]?.replace(/\r\n/gu, '') ?? '')).toBe(
      'Enter 482913 in the app.',
    );
  });

  it('bounces when imports are off, the domain is not ours or the mail is too large', async () => {
    const off = world({ action: 'accepted' });
    const paused = message();
    expect(
      await handleInbound(paused.value, { ...off.env, IMPORTS_MAIL_ENABLED: 'false' }, off.deps),
    ).toBe('paused');
    expect(paused.rejected[0]).toMatch(/paused/u);
    const other = message({ to: 'crew@elsewhere.example' });
    expect(await handleInbound(other.value, off.env, off.deps)).toBe('not_ours');
    const big = message({ rawSize: MAX_RAW_BYTES + 1 });
    expect(await handleInbound(big.value, off.env, off.deps)).toBe('too_large');
    expect(off.stored).toEqual([]);
    expect(off.posts).toEqual([]);
  });

  it('forwards the zone’s other addresses unchanged, even while imports are paused', async () => {
    const zone = world({ action: 'accepted' });
    const env = { ...zone.env, FORWARD_OTHER_MAIL_TO: 'founder@example.com' };
    const alert = message({ to: 'alert@critterpass.app' });
    expect(await handleInbound(alert.value, env, zone.deps)).toBe('forwarded');
    const paused = { ...env, IMPORTS_MAIL_ENABLED: 'false' };
    const hello = message({ to: 'Hello@critterpass.app' });
    expect(await handleInbound(hello.value, paused, zone.deps)).toBe('forwarded');
    expect(zone.forwards).toEqual(['founder@example.com', 'founder@example.com']);
    expect([...alert.rejected, ...hello.rejected]).toEqual([]);
    const crew = message();
    expect(await handleInbound(crew.value, paused, zone.deps)).toBe('paused');
    expect(zone.forwards).toHaveLength(2);
    expect(zone.stored).toEqual([]);
    expect(zone.posts).toEqual([]);
  });

  it('bounces with the api’s reason, or a try-later when the api is down', async () => {
    const retired = world({ action: 'rejected', reason: 'unknown_address' });
    const gone = message();
    expect(await handleInbound(gone.value, retired.env, retired.deps)).toBe('rejected');
    expect(gone.rejected[0]).toMatch(/no longer in use/u);
    const down = world({}, 503);
    const later = message();
    expect(await handleInbound(later.value, down.env, down.deps)).toBe('unavailable');
    expect(later.rejected[0]).toMatch(/try again later/u);
  });

  it('reads the sender verdicts Cloudflare stamped', () => {
    expect(
      senderVerdicts(new Headers({ 'authentication-results': 'x; dkim=fail; spf=softfail' })),
    ).toEqual({ dkim: 'fail', spf: 'softfail' });
    expect(senderVerdicts(new Headers())).toEqual({ dkim: 'none', spf: 'none' });
    expect(
      senderVerdicts(new Headers({ 'authentication-results': 'x; dkim=temperror; spf=temperror' })),
    ).toEqual({ dkim: 'fail', spf: 'none' });
  });
});
