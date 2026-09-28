/**
 * Known-image hash matching for photo avatars: the first moderation step, run before any model
 * sees the image (a match is never sent on). Behind the `moderation.hash_match` ops switch, which
 * stays off until the vendor enrolment (it needs the legal entity) is live; while it is off, or no
 * vendor key is configured, every photo waits for an ops reviewer instead.
 *
 * The vendor adapter is PhotoDNA Cloud Service's Match call (`POST /photodna/v1.0/Match`, the
 * image inline as base64, `Ocp-Apim-Subscription-Key` auth): `IsMatch` true is a hit; any status
 * other than 3000 (OK) is an error, so the job retries instead of letting an unscanned photo
 * through.
 */
import { AVATAR_HASH_MATCH_CONFIG_KEY } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

export interface HashMatchResult {
  readonly hit: boolean;
  /** Vendor reference for the ops/legal report (never the image). */
  readonly reference: string | null;
}

export interface HashMatcher {
  readonly vendor: string;
  match(image: Uint8Array, signal?: AbortSignal): Promise<HashMatchResult>;
}

export const PHOTODNA_MATCH_URL = 'https://api.microsoftmoderator.com/photodna/v1.0/Match';

const photoDnaResponseSchema = z.object({
  Status: z.object({ Code: z.number(), Description: z.string().nullable().optional() }),
  IsMatch: z.boolean().nullable().optional(),
  TrackingId: z.string().nullable().optional(),
});

export interface PhotoDnaOptions {
  readonly apiKey: string;
  readonly url?: string;
  /** Network boundary override (recorded fixtures in tests). */
  readonly fetch?: typeof fetch;
}

export function photoDnaMatcher(options: PhotoDnaOptions): HashMatcher {
  const doFetch = options.fetch ?? fetch;
  return {
    vendor: 'photodna',
    async match(image, signal) {
      const response = await doFetch(options.url ?? PHOTODNA_MATCH_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Ocp-Apim-Subscription-Key': options.apiKey,
        },
        body: JSON.stringify({
          DataRepresentation: 'inline',
          Value: Buffer.from(image).toString('base64'),
        }),
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) throw new Error(`photodna match failed: HTTP ${response.status}`);
      const body = photoDnaResponseSchema.parse(await response.json());
      if (body.Status.Code !== 3000) {
        throw new Error(`photodna match failed: status ${body.Status.Code}`);
      }
      return { hit: body.IsMatch === true, reference: body.TrackingId ?? null };
    },
  };
}

/** Whether ops switched hash matching on (`ops_config` `moderation.hash_match` = true). */
export async function hashMatchSwitchedOn(tx: pg.PoolClient): Promise<boolean> {
  const { rows } = await tx.query<{ value: unknown }>(
    'SELECT value FROM ops.ops_config WHERE key = $1',
    [AVATAR_HASH_MATCH_CONFIG_KEY],
  );
  return rows[0]?.value === true;
}
