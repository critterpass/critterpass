/**
 * One forwarded confirmation arriving at `{crew}@in.critterpass.app`. Email Routing's catch-all is
 * zone-wide, so mail for the zone's other addresses (alerts, the founder's own) lands here too: it is
 * forwarded unchanged to `FORWARD_OTHER_MAIL_TO`, the destination the catch-all used before, even
 * while imports are paused. Crew mail is bounced politely when imports are switched off, the address
 * is not ours or the message is too large; otherwise the Worker keeps the
 * raw message in R2 (the bucket's lifecycle deletes it after 7 days), read the sender verdicts
 * Cloudflare stamped on it, and post signed metadata (never the body) to the api. The api answers
 * whether the mail was accepted, quarantined (an unknown sender, who then gets the "Link this
 * email?" reply with a 6-digit code) or refused.
 *
 * Bindings and the network are injected, so this runs under Node in tests.
 */

/** Messages larger than this are bounced (confirmations with a PDF are well under it). */
export const MAX_RAW_BYTES = 10 * 1024 * 1024;

export interface InboundEnv {
  readonly RAW_MAIL: {
    put(key: string, value: ArrayBuffer, options?: R2PutOptions): Promise<unknown>;
  };
  readonly INBOUND_DOMAIN: string;
  readonly API_BASE_URL: string;
  readonly IMPORTS_MAIL_ENABLED?: string;
  readonly INBOUND_EMAIL_HMAC_SECRET: string;
  /** Verified Email Routing destination for mail to the zone's other addresses; unset = bounce it. */
  readonly FORWARD_OTHER_MAIL_TO?: string;
}

export type InboundMessage = Pick<
  ForwardableEmailMessage,
  'from' | 'to' | 'headers' | 'raw' | 'rawSize' | 'setReject'
>;

export interface InboundDeps {
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly newId: () => string;
  /** Sends a raw MIME reply to the message's sender (Cloudflare `message.reply`). */
  readonly reply: (raw: string) => Promise<void>;
  /** Forwards the message unchanged (Cloudflare `message.forward`). */
  readonly forward: (to: string) => Promise<void>;
}

export type InboundOutcome =
  | 'accepted'
  | 'quarantined'
  | 'duplicate'
  | 'rejected'
  | 'paused'
  | 'too_large'
  | 'not_ours'
  | 'forwarded'
  | 'unavailable';

const REJECT_TEXT: Readonly<Record<string, string>> = {
  paused: 'CritterPass imports are paused right now. Add the booking in the app instead.',
  too_large: 'This email is too large for CritterPass to import. Paste or scan it in the app.',
  not_ours: 'This CritterPass address does not exist.',
  unknown_address:
    'This CritterPass address is no longer in use. Ask your crew for the current one in the app.',
  unavailable: 'CritterPass could not take this email right now. Please try again later.',
};

const DKIM = ['pass', 'fail', 'none'] as const;
const SPF = ['pass', 'fail', 'softfail', 'neutral', 'none'] as const;

/** `dkim=` and `spf=` from Cloudflare's Authentication-Results header ("none" when absent). */
export function senderVerdicts(headers: Headers): {
  dkim: (typeof DKIM)[number];
  spf: (typeof SPF)[number];
} {
  const results = (headers.get('authentication-results') ?? '').toLowerCase();
  const dkim = /\bdkim=([a-z]+)/u.exec(results)?.[1] ?? 'none';
  const spf = /\bspf=([a-z]+)/u.exec(results)?.[1] ?? 'none';
  return {
    dkim: (DKIM as readonly string[]).includes(dkim)
      ? (dkim as (typeof DKIM)[number])
      : dkim === 'neutral' || dkim === 'policy'
        ? 'none'
        : 'fail',
    spf: (SPF as readonly string[]).includes(spf) ? (spf as (typeof SPF)[number]) : 'none',
  };
}

async function hmacHex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** `timestamp.body` signed with the shared secret: the api's `/webhooks/inbound-email` check. */
export function signBody(secret: string, timestamp: string, body: string): Promise<string> {
  return hmacHex(secret, `${timestamp}.${body}`);
}

function utf8Base64(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Lines(text: string): string {
  return (utf8Base64(text).match(/.{1,76}/gu) ?? []).join('\r\n');
}

function encodedWord(text: string): string {
  return /^[\x20-\x7e]*$/u.test(text) ? text : `=?UTF-8?B?${utf8Base64(text)}?=`;
}

/** A plain-text reply threaded under the original message. */
export function replyMime(input: {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly inReplyTo: string | null;
  readonly messageId: string;
  readonly date: Date;
}): string {
  const headers = [
    `From: CritterPass <${input.from}>`,
    `To: ${input.to}`,
    `Subject: ${encodedWord(input.subject)}`,
    `Message-ID: ${input.messageId}`,
    ...(input.inReplyTo === null
      ? []
      : [`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`]),
    `Date: ${input.date.toUTCString()}`,
    'Auto-Submitted: auto-replied',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  ];
  return `${headers.join('\r\n')}\r\n\r\n${base64Lines(input.text)}\r\n`;
}

interface ApiAnswer {
  readonly action?: string;
  readonly reason?: string;
  readonly reply?: { readonly subject: string; readonly text: string };
}

export async function handleInbound(
  message: InboundMessage,
  env: InboundEnv,
  deps: InboundDeps,
): Promise<InboundOutcome> {
  const reject = (reason: string, outcome: InboundOutcome): InboundOutcome => {
    message.setReject(REJECT_TEXT[reason] ?? REJECT_TEXT['unavailable'] ?? reason);
    return outcome;
  };
  const [localPart, domain] = message.to.toLowerCase().split('@');
  if (localPart === undefined || domain !== env.INBOUND_DOMAIN.toLowerCase()) {
    if (env.FORWARD_OTHER_MAIL_TO === undefined || env.FORWARD_OTHER_MAIL_TO === '') {
      return reject('not_ours', 'not_ours');
    }
    await deps.forward(env.FORWARD_OTHER_MAIL_TO);
    return 'forwarded';
  }
  if (env.IMPORTS_MAIL_ENABLED !== 'true') return reject('paused', 'paused');
  if (message.rawSize > MAX_RAW_BYTES) return reject('too_large', 'too_large');

  const now = deps.now();
  const raw = await new Response(message.raw).arrayBuffer();
  const r2Key = `inbound/${now.toISOString().slice(0, 10)}/${deps.newId()}.eml`;
  await env.RAW_MAIL.put(r2Key, raw, { httpMetadata: { contentType: 'message/rfc822' } });
  const messageId = message.headers.get('message-id');
  const body = JSON.stringify({
    local_part: localPart,
    from: message.from,
    message_id: messageId ?? r2Key,
    subject_present: message.headers.has('subject'),
    size_bytes: raw.byteLength,
    r2_key: r2Key,
    ...senderVerdicts(message.headers),
    received_at: now.toISOString(),
  });
  const timestamp = String(Math.floor(now.getTime() / 1000));
  let answer: ApiAnswer;
  try {
    const response = await deps.fetch(
      `${env.API_BASE_URL.replace(/\/$/u, '')}/webhooks/inbound-email`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cp-timestamp': timestamp,
          'x-cp-signature': await signBody(env.INBOUND_EMAIL_HMAC_SECRET, timestamp, body),
        },
        body,
      },
    );
    if (!response.ok) return reject('unavailable', 'unavailable');
    answer = await response.json<ApiAnswer>();
  } catch {
    return reject('unavailable', 'unavailable');
  }
  if (answer.action === 'accepted' || answer.action === 'duplicate') return answer.action;
  if (answer.action !== 'quarantined') return reject(answer.reason ?? 'unavailable', 'rejected');
  if (answer.reply !== undefined) {
    await deps.reply(
      replyMime({
        from: message.to,
        to: message.from,
        subject: answer.reply.subject,
        text: answer.reply.text,
        inReplyTo: messageId,
        messageId: `<${deps.newId()}@${env.INBOUND_DOMAIN}>`,
        date: now,
      }),
    );
  }
  return 'quarantined';
}
