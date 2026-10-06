/**
 * Postcard jobs, wired from the worker's environment. The inbox fan-outs always register (sent
 * postcards, address requests, mailing news). Printing needs the printer's key, the media bucket
 * (print files), the media signing keys (the printer reads them through signed URLs) and the field
 * keyring (addresses are sealed); without all of them no print job is registered and mailings wait
 * in `queued`.
 */
import { crypto as dbCrypto } from '@cp/db';

import type { AnyJobDefinition } from '../../boss/define-job';
import { createPrintRenderer } from '../../print/render';
import { createProdigiVendor, PRODIGI_POSTCARD_SKU, PRODIGI_SANDBOX_URL } from '../../print/vendor';
import { createAvatarMediaStore } from '../avatar/media-store';
import { postcardFulfilJob, postcardStatusJob } from './fulfil';
import { registerPostcardInboxFanouts } from './inbox';

export type PostcardJobsEnv = Readonly<Record<string, string | undefined>>;

function keyringFrom(env: PostcardJobsEnv) {
  const keys = env['FIELD_ENCRYPTION_KEYS'];
  const active = env['FIELD_ENCRYPTION_ACTIVE_KEY_ID'];
  if (keys === undefined || keys === '' || active === undefined) return undefined;
  const parsed = dbCrypto.parseFieldEncryptionKeys(keys);
  return active in parsed ? { activeKeyId: active, keys: parsed } : undefined;
}

function signingFrom(env: PostcardJobsEnv) {
  const baseUrl = env['MEDIA_PUBLIC_BASE_URL'];
  const keysJson = env['MEDIA_HMAC_KEYS'];
  const keyId = env['MEDIA_HMAC_ACTIVE_KID'];
  if (!baseUrl || !keysJson || !keyId) return undefined;
  const secret = (JSON.parse(keysJson) as Record<string, string | undefined>)[keyId];
  return secret === undefined ? undefined : { baseUrl, keyId, secret };
}

export function postcardJobs(env: PostcardJobsEnv): AnyJobDefinition[] {
  registerPostcardInboxFanouts();
  const apiKey = env['PRODIGI_API_KEY'];
  const keyring = keyringFrom(env);
  const signing = signingFrom(env);
  const endpoint = env['R2_S3_ENDPOINT'];
  const bucket = env['R2_BUCKET'];
  const accessKeyId = env['R2_ACCESS_KEY_ID'];
  const secretAccessKey = env['R2_SECRET_ACCESS_KEY'];
  if (
    !apiKey ||
    keyring === undefined ||
    signing === undefined ||
    !endpoint ||
    !bucket ||
    !accessKeyId ||
    !secretAccessKey
  ) {
    return [];
  }
  const store = createAvatarMediaStore({ endpoint, bucket, accessKeyId, secretAccessKey });
  const printer = createProdigiVendor({
    apiKey,
    baseUrl: env['PRODIGI_BASE_URL'] || PRODIGI_SANDBOX_URL,
    sku: env['PRINT_POSTCARD_SKU'] || PRODIGI_POSTCARD_SKU,
  });
  return [
    postcardFulfilJob({
      vendor: printer,
      store,
      keyring,
      render: createPrintRenderer(store, signing),
      callbackUrl: env['PRINT_CALLBACK_URL'] || undefined,
    }),
    postcardStatusJob(printer),
  ];
}
