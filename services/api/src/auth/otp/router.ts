/**
 * Phone OTP sender router (docs/product-decisions.md; requirements: "Conflict → merge", "SMS
 * pumping"): WhatsApp first (the Cloud API has no reachability lookup, so it is always tried, not
 * probed), then Telegram Gateway (a number that cannot receive codes errors without a charge),
 * then SMS through Prelude, in the order ./countries.ts gives. A channel whose send throws falls
 * through to the next one. Channels with no registered adapter (missing credentials for this
 * deployment) are skipped, never faked. A channel switched off in the ops
 * console (`otp.<channel>.enabled`) is skipped too; only when every channel the country could use
 * is off does the send answer `STATE_INVALID {reason: 'switched_off', key}` (the first channel's key).
 */
import type { KillSwitchReader } from '@cp/db';
import { DomainError, switchedOffError } from '@cp/domain';

import { countryOtpPolicy, isValidSendableNumber, type OtpChannel } from './countries';

export interface OtpChannelAdapter {
  /** Sends the code; resolves with a provider-assigned message id when the provider gives one (WhatsApp, Telegram Gateway), throws on a synchronous send failure. */
  send(input: { phoneE164: string; code: string }): Promise<{ providerMessageId?: string }>;
}

export interface OtpSendContext {
  readonly phoneE164: string;
  readonly code: string;
  /** The uid of the session requesting the code (anonymous sign-in already holds one before send-otp runs); undefined for a returning-user sign-in that has no session yet. */
  readonly uid: string | undefined;
  /** Better Auth's own `auth.verification.id` for this code, captured by databaseHooks.verification.create.after just before sendOTP runs. */
  readonly verificationId: string | undefined;
}

export interface OtpDeliveryTracker {
  /** Records which channel handled a verification, keyed by the provider's message id, so the WhatsApp and Telegram Gateway webhooks (services/api/src/routes/webhooks-*.ts) can correlate a later delivery-status callback back to a uid/verification. */
  recordDelivery(input: {
    readonly providerMessageId: string;
    readonly channel: OtpChannel;
    readonly uid: string | undefined;
    readonly verificationId: string | undefined;
    readonly phoneE164: string;
  }): Promise<void>;
}

export interface OtpRouterDeps {
  readonly adapters: Partial<Record<OtpChannel, OtpChannelAdapter>>;
  readonly tracker: OtpDeliveryTracker;
  /** The ops kill switches (`otp.<channel>.enabled`). */
  readonly switches: Pick<KillSwitchReader, 'isOn'>;
  /** Told about every channel whose send failed, so the reason reaches the logs (never the number). */
  readonly onChannelFailure?: ((failure: OtpChannelFailure) => void) | undefined;
}

export interface OtpChannelFailure {
  readonly channel: OtpChannel;
  /** The error code (`SUPPLIER_UNAVAILABLE`, …) or the error's name. */
  readonly code: string;
  /** Provider HTTP status, when the adapter reported one. */
  readonly status?: number | undefined;
  /** Provider reason with any digit run long enough to be a phone number masked. */
  readonly reason?: string | undefined;
}

/** Summarises a failed send for logs: code, provider status and reason, with phone-like digits masked. */
export function describeChannelFailure(channel: OtpChannel, error: unknown): OtpChannelFailure {
  const mask = (value: string) => value.replace(/\+?\d[\d\s-]{5,}\d/g, '…').slice(0, 300);
  if (error instanceof DomainError) {
    const detail = (error.detail ?? {}) as { status?: unknown; detail?: unknown };
    return {
      channel,
      code: error.code,
      ...(typeof detail.status === 'number' ? { status: detail.status } : {}),
      ...(typeof detail.detail === 'string' && detail.detail !== ''
        ? { reason: mask(detail.detail) }
        : {}),
    };
  }
  return {
    channel,
    code: error instanceof Error ? error.name : 'unknown',
    ...(error instanceof Error ? { reason: mask(error.message) } : {}),
  };
}

export interface OtpRouter {
  sendOTP(context: OtpSendContext): Promise<void>;
}

export function createOtpRouter(deps: OtpRouterDeps): OtpRouter {
  return {
    async sendOTP(context) {
      if (!isValidSendableNumber(context.phoneE164)) {
        throw new DomainError('VALIDATION', { reason: 'country_unsupported' });
      }
      const policy = countryOtpPolicy(context.phoneE164);
      if (!policy) {
        throw new DomainError('VALIDATION', { reason: 'country_unsupported' });
      }

      const registered = policy.channels.filter((channel) => deps.adapters[channel] !== undefined);
      if (registered.length === 0) {
        // Every channel this country could use has no credentials configured for this deployment
        // ("router skips unavailable channels"). Nothing to fake here.
        throw new DomainError('INTERNAL', { reason: 'no_otp_channel_available' });
      }
      const switchOf = (channel: OtpChannel) => `otp.${channel}.enabled`;
      const enabled: OtpChannel[] = [];
      for (const channel of registered) {
        if (await deps.switches.isOn(switchOf(channel))) enabled.push(channel);
      }
      const first = registered[0];
      if (enabled.length === 0 && first !== undefined) throw switchedOffError(switchOf(first));

      let lastError: unknown;
      for (const [index, channel] of enabled.entries()) {
        const adapter = deps.adapters[channel];
        if (!adapter) continue;
        try {
          const result = await adapter.send({ phoneE164: context.phoneE164, code: context.code });
          if (result.providerMessageId) {
            await deps.tracker.recordDelivery({
              providerMessageId: result.providerMessageId,
              channel,
              uid: context.uid,
              verificationId: context.verificationId,
              phoneE164: context.phoneE164,
            });
          }
          return;
        } catch (error) {
          lastError = error;
          deps.onChannelFailure?.(describeChannelFailure(channel, error));
          // A failed send falls through to the next channel; the last channel in the order has
          // nowhere left to fall back to, so its error is the one that surfaces.
          if (index === enabled.length - 1) throw error;
        }
      }
      throw lastError instanceof Error ? lastError : new DomainError('INTERNAL');
    },
  };
}

/** Minimal Redis surface `createRedisOtpDeliveryTracker` needs; matches node-redis's client shape. */
export interface DeliveryTrackerRedisClient {
  setEx(key: string, seconds: number, value: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

export interface DeliveryTrackerRecord {
  readonly channel: OtpChannel;
  readonly uid: string | undefined;
  readonly verificationId: string | undefined;
  readonly phoneE164: string;
}

const DELIVERY_TRACKING_TTL_SECONDS = 600;

/**
 * Correlates a WhatsApp Cloud API message id or a Telegram Gateway request id back to the
 * uid/verification that requested it, so the delivery-status webhooks can turn a later undelivered
 * status into `otp.channel_failed` on the right `user:#uid` channel. Redis-backed (not Postgres):
 * the record only matters for the life of one OTP attempt (docs/data-model.md §3.1 OTP is 300 s).
 */
export function createRedisOtpDeliveryTracker(
  redis: DeliveryTrackerRedisClient,
): OtpDeliveryTracker {
  return {
    async recordDelivery(input) {
      const record: DeliveryTrackerRecord = {
        channel: input.channel,
        uid: input.uid,
        verificationId: input.verificationId,
        phoneE164: input.phoneE164,
      };
      await redis.setEx(
        `auth:otp:delivery:${input.providerMessageId}`,
        DELIVERY_TRACKING_TTL_SECONDS,
        JSON.stringify(record),
      );
    },
  };
}

export async function findDeliveryByProviderMessageId(
  redis: DeliveryTrackerRedisClient,
  providerMessageId: string,
): Promise<DeliveryTrackerRecord | undefined> {
  const raw = await redis.get(`auth:otp:delivery:${providerMessageId}`);
  if (raw === null) return undefined;
  return JSON.parse(raw) as DeliveryTrackerRecord;
}
