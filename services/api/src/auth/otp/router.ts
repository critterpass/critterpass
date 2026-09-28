/**
 * Phone OTP sender router (docs/product-decisions.md; requirements: "Conflict → merge", "SMS
 * pumping"): WhatsApp first wherever the country allows it (the Cloud API has no reachability
 * lookup, so it is always tried, not probed), SMS (Prelude/Twilio Verify per ./countries.ts) as
 * fallback or for countries without WhatsApp. Channels with no registered adapter (missing
 * credentials for this deployment) are skipped, never faked. A channel switched off in the ops
 * console (`otp.<channel>.enabled`) is skipped too; only when every channel the country could use
 * is off does the send answer `STATE_INVALID {reason: 'switched_off', key}` (the first channel's key).
 */
import type { KillSwitchReader } from '@cp/db';
import { DomainError, switchedOffError } from '@cp/domain';

import { countryOtpPolicy, isValidSendableNumber, type OtpChannel } from './countries';

export interface OtpChannelAdapter {
  /** Sends the code; resolves with a provider-assigned message id when the provider gives one (WhatsApp), throws on a synchronous send failure. */
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
  /** Records which channel handled a verification, keyed by the provider's message id, so the WhatsApp webhook (services/api/src/routes/webhooks-whatsapp.ts) can correlate a later delivery-status callback back to a uid/verification. */
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
}

export interface OtpRouter {
  sendOTP(context: OtpSendContext): Promise<void>;
}

function channelOrder(
  policy: NonNullable<ReturnType<typeof countryOtpPolicy>>,
): readonly OtpChannel[] {
  return policy.whatsappAllowed ? ['whatsapp', policy.smsChannel] : [policy.smsChannel];
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

      const order = channelOrder(policy);
      const registered = order.filter((channel) => deps.adapters[channel] !== undefined);
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
          // WhatsApp send error falls back to SMS; the last channel in
          // the order has nowhere left to fall back to, so its error is the one that surfaces.
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
 * Correlates a WhatsApp Cloud API message id back to the uid/verification that requested it, so
 * services/api/src/routes/webhooks-whatsapp.ts can turn a later `failed`/`undelivered` delivery
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
