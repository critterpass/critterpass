/**
 * RevenueCat's two contracts we rely on: the webhook body it sends us, and the customer read we
 * verify every change against (`GET /v1/subscribers/{app_user_id}` with the project's secret key,
 * the read RevenueCat's webhook documentation recommends after each event). Nothing here decides
 * what a purchase means; `map-subscriber.ts` does, from what RevenueCat returned.
 */
import { DomainError } from '@cp/domain';
import { z } from 'zod';

const isoOrNull = z.string().nullish();

export const rcWebhookEventSchema = z
  .object({
    id: z.string().min(1).max(200),
    type: z.string().min(1).max(64),
    app_user_id: z.string().max(200).nullish(),
    original_app_user_id: z.string().max(200).nullish(),
    aliases: z.array(z.string()).nullish(),
    transferred_from: z.array(z.string()).nullish(),
    transferred_to: z.array(z.string()).nullish(),
    product_id: z.string().nullish(),
    new_product_id: z.string().nullish(),
    event_timestamp_ms: z.number().nullish(),
    purchased_at_ms: z.number().nullish(),
    expiration_at_ms: z.number().nullish(),
    environment: z.enum(['SANDBOX', 'PRODUCTION']).nullish(),
    store: z.string().nullish(),
    transaction_id: z.string().nullish(),
    original_transaction_id: z.string().nullish(),
    currency: z.string().nullish(),
    price_in_purchased_currency: z.number().nullish(),
    country_code: z.string().nullish(),
    cancel_reason: z.string().nullish(),
    expiration_reason: z.string().nullish(),
    offer_code: z.string().nullish(),
    subscriber_attributes: z
      .record(z.string(), z.object({ value: z.string().nullish() }).loose())
      .nullish(),
  })
  .loose();
export type RcWebhookEvent = z.infer<typeof rcWebhookEventSchema>;

export const rcWebhookBodySchema = z.object({
  api_version: z.string().optional(),
  event: rcWebhookEventSchema,
});

const rcSubscriptionSchema = z
  .object({
    expires_date: isoOrNull,
    purchase_date: z.string(),
    original_purchase_date: isoOrNull,
    period_type: z.string().nullish(),
    store: z.string(),
    is_sandbox: z.boolean().default(false),
    unsubscribe_detected_at: isoOrNull,
    billing_issues_detected_at: isoOrNull,
    grace_period_expires_date: isoOrNull,
    refunded_at: isoOrNull,
    auto_resume_date: isoOrNull,
    store_transaction_id: z.string().nullish(),
  })
  .loose();
export type RcSubscription = z.infer<typeof rcSubscriptionSchema>;

const rcNonSubscriptionSchema = z
  .object({
    id: z.string(),
    purchase_date: z.string(),
    store: z.string(),
    is_sandbox: z.boolean().default(false),
    store_transaction_id: z.string().nullish(),
  })
  .loose();
export type RcNonSubscription = z.infer<typeof rcNonSubscriptionSchema>;

export const rcSubscriberResponseSchema = z.object({
  request_date_ms: z.number().optional(),
  subscriber: z
    .object({
      original_app_user_id: z.string(),
      subscriptions: z.record(z.string(), rcSubscriptionSchema).default({}),
      non_subscriptions: z.record(z.string(), z.array(rcNonSubscriptionSchema)).default({}),
      subscriber_attributes: z
        .record(z.string(), z.object({ value: z.string().nullish() }).loose())
        .default({}),
      management_url: z.string().nullish(),
    })
    .loose(),
});
export type RcSubscriber = z.infer<typeof rcSubscriberResponseSchema>['subscriber'];

export interface RevenueCatClient {
  /** The customer as RevenueCat sees it now (throws a retryable error when RevenueCat is down). */
  getSubscriber(appUserId: string): Promise<RcSubscriber>;
}

export interface RevenueCatClientOptions {
  readonly secretKey: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.revenuecat.com/v1';

export function createRevenueCatClient(options: RevenueCatClientOptions): RevenueCatClient {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  return {
    async getSubscriber(appUserId) {
      let response: Response;
      try {
        response = await doFetch(`${baseUrl}/subscribers/${encodeURIComponent(appUserId)}`, {
          headers: {
            authorization: `Bearer ${options.secretKey}`,
            accept: 'application/json',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new DomainError('UPSTREAM_TIMEOUT', {
          upstream: 'revenuecat',
          reason: error instanceof Error ? error.name : 'fetch_failed',
        });
      }
      if (response.status === 429 || response.status >= 500) {
        throw new DomainError('SUPPLIER_UNAVAILABLE', {
          upstream: 'revenuecat',
          status: response.status,
        });
      }
      if (!response.ok) {
        throw new Error(`revenuecat subscriber read failed with ${response.status}`);
      }
      return rcSubscriberResponseSchema.parse(await response.json()).subscriber;
    },
  };
}
