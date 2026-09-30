/**
 * Grab partner OAuth (developer.grab.com, two-legged client credentials, scope `ride.estimate`):
 * one bearer token per deployment, fetched on first use and reused until a minute before it
 * expires. A refused client (401/403) surfaces as `SUPPLIER_UNAVAILABLE` through the caller's
 * `toSupplierDomainError`, so the card falls back to plain app links.
 */
import { z } from 'zod';

import type { SupplierHttp } from '../core/http';

export const GRAB_SUPPLIER = 'grab';
export const GRAB_PRODUCTION_URL = 'https://partner-api.grab.com';
export const GRAB_STAGING_URL = 'https://partner-api.stg-myteksi.com';
export const GRAB_ESTIMATE_SCOPE = 'ride.estimate';

export interface GrabConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  /** `GRAB_PRODUCTION_URL` or `GRAB_STAGING_URL`. */
  readonly baseUrl: string;
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().int().positive(),
});

const EARLY_REFRESH_MS = 60_000;

export interface GrabTokenSource {
  token(): Promise<string>;
}

export function createGrabTokenSource(
  http: SupplierHttp,
  config: GrabConfig,
  now: () => number = Date.now,
): GrabTokenSource {
  let cached: { value: string; expiresAt: number } | undefined;
  return {
    async token() {
      if (cached !== undefined && cached.expiresAt - EARLY_REFRESH_MS > now()) return cached.value;
      const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'client_credentials',
        scope: GRAB_ESTIMATE_SCOPE,
      }).toString();
      const response = await http.request({
        supplier: GRAB_SUPPLIER,
        endpoint: 'oauth_token',
        url: `${config.baseUrl.replace(/\/$/, '')}/grabid/v1/oauth2/token`,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        timeoutMs: 15_000,
      });
      const parsed = tokenSchema.parse(JSON.parse(response.body));
      cached = { value: parsed.access_token, expiresAt: now() + parsed.expires_in * 1000 };
      return cached.value;
    },
  };
}
