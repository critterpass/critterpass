import { serve, type ServerType } from '@hono/node-server';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { Hono } from 'hono';

/**
 * Stands in for an external identity provider (Apple/Google) at the protocol level: a real
 * OIDC discovery document, a real JWKS endpoint and real EdDSA-signed ID tokens. Native
 * Apple/Google sign-in itself is T3's device-side spike (a separate agent, mobile-only);
 * this proves the server's account-linking and anonymous-merge code against a faithful
 * stand-in, which is the sanctioned test-double boundary (an external network dependency),
 * not a mock of any code this repo owns.
 */
export interface MockIdp {
  issuer: string;
  clientId: string;
  mintIdToken(claims: { sub: string; email: string; emailVerified?: boolean }): Promise<string>;
  close(): Promise<void>;
}

const ALG = 'EdDSA';
const CLIENT_ID = 'spike-client';

export async function startMockIdp(): Promise<MockIdp> {
  const { publicKey, privateKey } = await generateKeyPair(ALG, {
    crv: 'Ed25519',
    extractable: true,
  });
  const kid = 'spike-mock-idp-1';
  const publicJwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: ALG, use: 'sig' };

  let issuer = '';
  const app = new Hono();
  app.get('/.well-known/openid-configuration', (c) =>
    c.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      id_token_signing_alg_values_supported: [ALG],
    }),
  );
  app.get('/jwks', (c) => c.json({ keys: [publicJwk] }));

  const server: ServerType = await new Promise((resolve) => {
    const started = serve({ fetch: app.fetch, port: 0 }, () => resolve(started));
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('s-auth mock idp: expected a network address, got a pipe/unix socket');
  }
  issuer = `http://127.0.0.1:${address.port}`;

  return {
    issuer,
    clientId: CLIENT_ID,
    async mintIdToken({ sub, email, emailVerified = true }) {
      return new SignJWT({ email, email_verified: emailVerified })
        .setProtectedHeader({ alg: ALG, kid })
        .setIssuer(issuer)
        .setAudience(CLIENT_ID)
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
