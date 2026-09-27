import { Hono } from 'hono';

interface Jwk {
  kid?: string;
  alg?: string;
  use?: string;
  [key: string]: unknown;
}

/**
 * Centrifugo v6.9.6 silently rejects a JWKS key with no `use` field ("public key not found",
 * despite a matching `kid`) — confirmed by pointing it at a hand-built JWKS with and without
 * `use: "sig"`. Better Auth's `jwt` plugin `/jwks` endpoint never sets `use` (its handler
 * builds `{alg, crv, ...JSON.parse(publicKey), kid}` with no such field), so real S-RT traffic
 * needs this in front of it — recorded here as a production integration requirement, not only
 * a spike workaround. `docs/decisions/<date>-centrifugo-realtime-proxy.md` has the writeup.
 */
export function createJwksRewriteApp(sourceJwksUrl: string) {
  const app = new Hono();
  app.get('/jwks', async (c) => {
    const response = await fetch(sourceJwksUrl);
    const body = (await response.json()) as { keys: Jwk[] };
    return c.json({ keys: body.keys.map((key) => ({ ...key, use: key.use ?? 'sig' })) });
  });
  return app;
}
