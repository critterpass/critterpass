/**
 * Prints a signed media URL for an object in R2, the same way the api mints read URLs.
 * Keys come from MEDIA_HMAC_KEYS (JSON `{kid: secret}`) and MEDIA_HMAC_ACTIVE_KID; nothing secret is printed.
 *
 *   pnpm tsx tools/scripts/sign-media-url.ts --base https://media.staging.critterpass.app --key smoke/hello.txt
 */
import { parseArgs } from 'node:util';

import { signMediaUrl } from '@cp/domain';

async function main() {
  // pnpm forwards a literal `--` separator; drop it before parsing.
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: {
      base: { type: 'string' },
      key: { type: 'string' },
      variant: { type: 'string', default: 'original' },
      ttl: { type: 'string', default: '600' },
    },
  });
  if (!values.base || !values.key) throw new Error('--base and --key are required');

  const keys = JSON.parse(process.env['MEDIA_HMAC_KEYS'] ?? '{}') as Record<string, string>;
  const keyId = process.env['MEDIA_HMAC_ACTIVE_KID'] ?? Object.keys(keys)[0];
  const secret = keyId ? keys[keyId] : undefined;
  if (!keyId || !secret)
    throw new Error('MEDIA_HMAC_KEYS / MEDIA_HMAC_ACTIVE_KID do not name a key');

  const url = await signMediaUrl({
    baseUrl: values.base,
    objectKey: values.key,
    variant: values.variant,
    expiresAt: Math.floor(Date.now() / 1000) + Number(values.ttl),
    keyId,
    secret,
  });
  console.log(url);
}

await main();
