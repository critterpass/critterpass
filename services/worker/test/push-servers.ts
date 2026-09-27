/**
 * Transport-level stand-ins for APNs and FCM: a local HTTP/2 TLS server that answers like APNs and
 * a local HTTPS server that answers like FCM HTTP v1 and Google's token endpoint, both replaying the
 * recorded responses in ./fixtures/push. The real `@parse/node-apn` and `firebase-admin` clients
 * talk to them over the wire; the recipient token picks the recorded answer (`ok-…`, `gone-…`).
 */
import { execFileSync } from 'node:child_process';
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';

import apnsResponses from './fixtures/push/apns-responses.json' with { type: 'json' };
import fcmResponses from './fixtures/push/fcm-responses.json' with { type: 'json' };

interface Recorded {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

function recorded(table: Record<string, unknown>, token: string): Recorded {
  const kind = token.split('-')[0] ?? 'ok';
  return (table[kind] ?? table['ok']) as Recorded;
}

/** A throwaway self-signed certificate for `localhost` (openssl is on every dev and CI machine). */
function selfSignedCert(): { key: string; cert: string } {
  const dir = mkdtempSync(join(tmpdir(), 'cp-push-cert-'));
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-keyout',
        join(dir, 'key.pem'),
        '-out',
        join(dir, 'cert.pem'),
      ],
      { stdio: 'ignore' },
    );
    return {
      key: readFileSync(join(dir, 'key.pem'), 'utf8'),
      cert: readFileSync(join(dir, 'cert.pem'), 'utf8'),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface ApnsRequest {
  readonly server: 'prod' | 'sandbox';
  readonly path: string;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, unknown>;
  readonly jwtValid: boolean;
}

export interface FakeApns {
  readonly addresses: { prod: string; sandbox: string };
  readonly credentials: { keyId: string; teamId: string; privateKeyPem: string };
  readonly requests: ApnsRequest[];
  close(): Promise<void>;
}

function verifyProviderJwt(authorization: string | undefined, publicKeyPem: string): boolean {
  const token = authorization?.replace(/^bearer /i, '');
  const [header, payload, signature] = token?.split('.') ?? [];
  if (!header || !payload || !signature) return false;
  return verify(
    'sha256',
    Buffer.from(`${header}.${payload}`),
    { key: createPublicKey(publicKeyPem), dsaEncoding: 'ieee-p1363' },
    Buffer.from(signature, 'base64url'),
  );
}

export async function startFakeApns(): Promise<FakeApns> {
  const { key, cert } = selfSignedCert();
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const requests: ApnsRequest[] = [];

  const start = (server: 'prod' | 'sandbox') =>
    new Promise<http2.Http2SecureServer>((resolve) => {
      const instance = http2.createSecureServer({ key, cert }, (req, res) => {
        let raw = '';
        req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
        req.on('end', () => {
          const path = req.headers[':path'] ?? '';
          const deviceToken = path.split('/').pop() ?? '';
          const headers = Object.fromEntries(
            Object.entries(req.headers).map(([name, value]) => [
              name,
              Array.isArray(value) ? value.join(',') : value,
            ]),
          );
          requests.push({
            server,
            path,
            headers,
            body: JSON.parse(raw || '{}') as Record<string, unknown>,
            jwtValid: verifyProviderJwt(req.headers.authorization, publicKeyPem),
          });
          const answer = recorded(apnsResponses, deviceToken);
          res.writeHead(answer.status, { 'content-type': 'application/json', ...answer.headers });
          res.end(answer.body === undefined ? '' : JSON.stringify(answer.body));
        });
      });
      instance.listen(0, '127.0.0.1', () => resolve(instance));
    });

  const [prod, sandbox] = await Promise.all([start('prod'), start('sandbox')]);
  const port = (server: http2.Http2SecureServer) => (server.address() as AddressInfo).port;
  return {
    addresses: { prod: `localhost:${port(prod)}`, sandbox: `localhost:${port(sandbox)}` },
    credentials: { keyId: 'TESTKEY001', teamId: 'TESTTEAM01', privateKeyPem },
    requests,
    async close() {
      await Promise.all(
        [prod, sandbox].map(
          (server) => new Promise<void>((resolve) => server.close(() => resolve())),
        ),
      );
    },
  };
}

export interface FcmRequest {
  readonly path: string;
  readonly authorization: string | undefined;
  readonly body: { message?: Record<string, unknown> } & Record<string, unknown>;
}

export interface FakeFcm {
  /** Routes every TLS connection the Firebase client opens to this server. */
  readonly agent: https.Agent;
  /**
   * Google's OAuth token exchange replayed from the recording: the token client inside
   * firebase-admin uses fetch, which ignores the agent, so it is answered here instead of on the wire.
   */
  readonly credential: { getAccessToken(): Promise<{ access_token: string; expires_in: number }> };
  readonly serviceAccount: { project_id: string; client_email: string; private_key: string };
  readonly requests: FcmRequest[];
  close(): Promise<void>;
}

class LoopbackAgent extends https.Agent {
  constructor(private readonly port: number) {
    super({ keepAlive: false });
  }

  override createConnection(options: tls.ConnectionOptions): tls.TLSSocket {
    return tls.connect({
      ...options,
      host: '127.0.0.1',
      port: this.port,
      servername: 'localhost',
      rejectUnauthorized: false,
    });
  }
}

export async function startFakeFcm(): Promise<FakeFcm> {
  const { key, cert } = selfSignedCert();
  const requests: FcmRequest[] = [];
  const server = https.createServer({ key, cert }, (req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
    req.on('end', () => {
      const path = req.url ?? '';
      const body = JSON.parse(raw || '{}') as FcmRequest['body'];
      requests.push({ path, authorization: req.headers.authorization, body });
      const answer = recorded(
        fcmResponses,
        typeof body.message?.['token'] === 'string' ? body.message['token'] : '',
      );
      res.writeHead(answer.status, { 'content-type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify(answer.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const serviceKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    agent: new LoopbackAgent(port),
    credential: {
      getAccessToken: () =>
        Promise.resolve({
          access_token: fcmResponses.token.body.access_token,
          expires_in: fcmResponses.token.body.expires_in,
        }),
    },
    serviceAccount: {
      project_id: 'critterpass-test',
      client_email: 'push@critterpass-test.iam.gserviceaccount.com',
      private_key: serviceKey.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    },
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
