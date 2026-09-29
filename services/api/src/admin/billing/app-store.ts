/**
 * App Store Server API: Extend a Subscription Renewal Date, the one store call support may make
 * (customer-service compensation, at most 90 days, twice a year per customer). Authenticated with
 * an ES256 JWT signed by the App Store Connect in-app purchase key; off until that key is set.
 */
import { createPrivateKey, randomUUID, sign } from 'node:crypto';

import { DomainError } from '@cp/domain';
import { z } from 'zod';

const optional = z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional());

export const appStoreEnvSchema = z.object({
  APP_STORE_ISSUER_ID: optional,
  APP_STORE_KEY_ID: optional,
  APP_STORE_PRIVATE_KEY_PEM: optional,
  APP_STORE_BUNDLE_ID: optional,
  APP_STORE_ENVIRONMENT: z.enum(['production', 'sandbox']).default('sandbox'),
});

export interface AppStoreServerApi {
  extendRenewal(
    originalTransactionId: string,
    days: number,
  ): Promise<{ effectiveDate: number | null }>;
}

const base64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');

export function signAppStoreJwt(
  config: { issuerId: string; keyId: string; privateKeyPem: string; bundleId: string },
  now: Date,
): string {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId, typ: 'JWT' }));
  const iat = Math.floor(now.getTime() / 1000);
  const payload = base64url(
    JSON.stringify({
      iss: config.issuerId,
      iat,
      exp: iat + 300,
      aud: 'appstoreconnect-v1',
      bid: config.bundleId,
    }),
  );
  const key = createPrivateKey(config.privateKeyPem.replaceAll('\\n', '\n'));
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return `${header}.${payload}.${base64url(signature)}`;
}

export function appStoreServerApiFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  doFetch: typeof fetch = fetch,
): AppStoreServerApi | undefined {
  const parsed = appStoreEnvSchema.parse(env);
  const { APP_STORE_ISSUER_ID: issuerId, APP_STORE_KEY_ID: keyId } = parsed;
  const { APP_STORE_PRIVATE_KEY_PEM: privateKeyPem, APP_STORE_BUNDLE_ID: bundleId } = parsed;
  if (!issuerId || !keyId || !privateKeyPem || !bundleId) return undefined;
  const host =
    parsed.APP_STORE_ENVIRONMENT === 'production'
      ? 'https://api.storekit.itunes.apple.com'
      : 'https://api.storekit-sandbox.itunes.apple.com';
  return {
    async extendRenewal(originalTransactionId, days) {
      const token = signAppStoreJwt({ issuerId, keyId, privateKeyPem, bundleId }, new Date());
      const response = await doFetch(
        `${host}/inApps/v1/subscriptions/extend/${encodeURIComponent(originalTransactionId)}`,
        {
          method: 'PUT',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          // Reason 1: customer satisfaction (support compensation).
          body: JSON.stringify({
            extendByDays: days,
            extendReasonCode: 1,
            requestIdentifier: randomUUID(),
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) {
        throw new DomainError(
          response.status >= 500 ? 'SUPPLIER_UNAVAILABLE' : 'SUPPLIER_REJECTED',
          {
            upstream: 'app_store',
            status: response.status,
          },
        );
      }
      const body = (await response.json()) as { effectiveDate?: number };
      return { effectiveDate: body.effectiveDate ?? null };
    },
  };
}
