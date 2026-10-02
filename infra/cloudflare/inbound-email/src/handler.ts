/**
 * One forwarded confirmation arriving at `{crew}@in.critterpass.app`. Email Routing's catch-all is
 * zone-wide, so mail for the zone's other addresses (alerts, the founder's own) lands here too: it is
 * forwarded unchanged to `FORWARD_OTHER_MAIL_TO`, the destination the catch-all used before, even
 * while imports are paused. Crew mail is bounced politely when imports are switched off, the address
 * is not ours or the message is too large; otherwise the Worker keeps the
 * raw message in R2 (the bucket's lifecycle deletes it after 7 days), read the sender verdicts
 * Cloudflare stamped on it, and post signed metadata (never the body) to the api. The api answers
 * whether the mail was accepted, quarantined (an unknown sender, who then gets the "Link this
 * email?" reply with a 6-digit code, whose delivery is reported back: ./link-code-reply) or refused.
 * Every crew message logs one line with its outcome and the DKIM/SPF/DMARC verdicts, never an
 * address, subject or body.
 *
 * Bindings and the network are injected, so this runs under Node in tests.
 */

import {
  deliverLinkCode,
  dmarcVerdict,
  postSigned,
  type InboundLog,
  type LinkCodeReplyDeps,
} from './link-code-reply';

export { signBody } from './link-code-reply';

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

export interface InboundDeps extends LinkCodeReplyDeps {
  readonly newId: () => string;
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

/** Whether the envelope sender is the address in the From header (compared, never logged). */
export function envelopeIsAuthor(envelope: string, headers: Headers): boolean {
  const from = headers.get('from') ?? '';
  const address = (/<([^<>]+)>\s*$/u.exec(from)?.[1] ?? from).trim().toLowerCase();
  return address !== '' && address === envelope.trim().toLowerCase();
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
  readonly reply?: {
    readonly subject: string;
    readonly text: string;
    readonly link_id?: string;
  };
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
  const { dkim, spf } = senderVerdicts(message.headers);
  const verdicts = {
    dkim,
    spf,
    dmarc: dmarcVerdict(message.headers),
    // A manual forward comes from its author; an auto-forward or redirect keeps the original From
    // while the envelope (where a reply goes) is the forwarder's or the original sender's.
    envelope_is_author: envelopeIsAuthor(message.from, message.headers),
  };
  const body = JSON.stringify({
    local_part: localPart,
    from: message.from,
    message_id: messageId ?? r2Key,
    subject_present: message.headers.has('subject'),
    size_bytes: raw.byteLength,
    r2_key: r2Key,
    dkim,
    spf,
    received_at: now.toISOString(),
  });
  const log = (outcome: InboundOutcome, extra: InboundLog = {}): InboundOutcome => {
    deps.log({ event: 'inbound_email', outcome, ...verdicts, ...extra });
    return outcome;
  };
  const response = await postSigned(
    deps,
    `${env.API_BASE_URL.replace(/\/$/u, '')}/webhooks/inbound-email`,
    env.INBOUND_EMAIL_HMAC_SECRET,
    body,
  );
  let answer: ApiAnswer;
  try {
    if (response === null || !response.ok) throw new Error('api unavailable');
    answer = await response.json<ApiAnswer>();
  } catch {
    return log(reject('unavailable', 'unavailable'), { api_status: response?.status ?? 0 });
  }
  if (answer.action === 'accepted' || answer.action === 'duplicate') return log(answer.action);
  if (answer.action !== 'quarantined') {
    return log(reject(answer.reason ?? 'unavailable', 'rejected'), {
      reason: answer.reason ?? null,
    });
  }
  log('quarantined', { link_code: answer.reply !== undefined });
  if (answer.reply !== undefined) {
    await deliverLinkCode(
      {
        raw: replyMime({
          from: message.to,
          to: message.from,
          subject: answer.reply.subject,
          text: answer.reply.text,
          inReplyTo: messageId,
          messageId: `<${deps.newId()}@${env.INBOUND_DOMAIN}>`,
          date: now,
        }),
        linkId: answer.reply.link_id ?? null,
        dmarc: verdicts.dmarc,
        apiBaseUrl: env.API_BASE_URL,
        secret: env.INBOUND_EMAIL_HMAC_SECRET,
      },
      deps,
    );
  }
  return 'quarantined';
}
