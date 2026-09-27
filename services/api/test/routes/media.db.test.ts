/**
 * Media upload and read primitives against real services: Postgres + Redis + Better Auth sessions
 * and an S3-compatible object store (RustFS) standing in for R2's S3 API, so presigned URLs are
 * exercised by actually uploading through them.
 */
import { createHash } from 'node:crypto';

import { generateUuidV7, verifyMediaSignature } from '@cp/domain';
import { AwsClient } from 'aws4fetch';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createR2Client, type R2Config } from '../../src/media/r2';
import { registerMediaUploadCommand } from '../../src/media/register-media-upload';
import { mediaSigningConfigFromEnv } from '../../src/media/sign';
import { registerMediaRoutes } from '../../src/routes/media';

import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from './command-doors-harness';

const S3_IMAGE = 'rustfs/rustfs:1.0.0';
const ACCESS_KEY = 'media-test-access';
const SECRET_KEY = 'media-test-secret-key';
const BUCKET = 'cp-media-test';
const KID = 'k1';
const HMAC_SECRET = 'media-test-hmac-secret-at-least-32-chars';
const MEDIA_BASE_URL = 'https://media.critterpass.test';
const MiB = 1024 * 1024;

let s3: StartedTestContainer;
let harness: CommandDoorsHarness;

beforeAll(async () => {
  s3 = await new GenericContainer(S3_IMAGE)
    .withEnvironment({ RUSTFS_ACCESS_KEY: ACCESS_KEY, RUSTFS_SECRET_KEY: SECRET_KEY })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp('/health', 9000).forStatusCode(200))
    .start();
  const r2Config: R2Config = {
    endpoint: `http://${s3.getHost()}:${s3.getMappedPort(9000)}`,
    bucket: BUCKET,
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  };
  const admin = new AwsClient({
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    service: 's3',
    region: 'auto',
  });
  const created = await admin.fetch(`${r2Config.endpoint}/${BUCKET}`, { method: 'PUT' });
  if (!created.ok) throw new Error(`bucket create failed: ${created.status}`);

  harness = await startCommandDoors(
    (registry) => registry.register(registerMediaUploadCommand),
    (app, deps) =>
      registerMediaRoutes(app, {
        ...deps,
        r2: createR2Client(r2Config),
        signing: mediaSigningConfigFromEnv({
          baseUrl: MEDIA_BASE_URL,
          keysJson: JSON.stringify({ [KID]: HMAC_SECRET }),
          activeKeyId: KID,
        }),
      }),
  );
}, 240_000);

afterAll(async () => {
  await harness.stop();
  await s3.stop();
});

function post(session: SignedIn | undefined, path: string, body: unknown): Promise<Response> {
  return harness.request(path, {
    method: 'POST',
    headers: session !== undefined ? { cookie: session.cookie } : {},
    body: JSON.stringify(body),
  });
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

interface Presigned {
  media_key: string;
  put_url: string;
  headers: Record<string, string>;
}

async function presign(
  session: SignedIn,
  bytes: Uint8Array,
  purpose = 'photo',
): Promise<Presigned> {
  const response = await post(session, '/v1/media/presign', {
    purpose,
    content_type: 'image/jpeg',
    bytes: bytes.byteLength,
    sha256: sha256Hex(bytes),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Presigned;
}

async function readUrls(session: SignedIn, keys: string[]): Promise<Response> {
  return post(session, '/v1/media/read-urls', { media_keys: keys });
}

describe('POST /v1/media/presign', () => {
  it('presigns a checksummed PUT that accepts exactly the declared bytes and registers the object', async () => {
    const session = await harness.signInAnonymously();
    const bytes = new TextEncoder().encode('a small jpeg stand-in');
    const presigned = await presign(session, bytes);

    expect(presigned.media_key).toMatch(new RegExp(`^u/${session.uid}/photo/[0-9a-f-]{36}$`));
    const tampered = new TextEncoder().encode('a small jpeg stand-iN');
    expect(
      (
        await fetch(presigned.put_url, {
          method: 'PUT',
          body: tampered,
          headers: presigned.headers,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(presigned.put_url, {
          method: 'PUT',
          body: new TextEncoder().encode('a longer body than was declared'),
          headers: presigned.headers,
        })
      ).status,
    ).toBe(403);
    const uploaded = await fetch(presigned.put_url, {
      method: 'PUT',
      body: bytes,
      headers: presigned.headers,
    });
    expect(uploaded.status).toBe(200);

    const { rows } = await harness.pool.query(
      'SELECT owner_id, purpose, kind, bytes, sha256 FROM media_objects WHERE r2_key = $1',
      [presigned.media_key],
    );
    expect(rows).toEqual([
      {
        owner_id: session.uid,
        purpose: 'photo',
        kind: 'image/jpeg',
        bytes: String(bytes.byteLength),
        sha256: sha256Hex(bytes),
      },
    ]);
  });

  it('refuses oversize uploads with PAYLOAD_TOO_LARGE and foreign content types with VALIDATION', async () => {
    const session = await harness.signInAnonymously();
    const request = (purpose: string, contentType: string, bytes: number) =>
      post(session, '/v1/media/presign', {
        purpose,
        content_type: contentType,
        bytes,
        sha256: sha256Hex(new Uint8Array([1])),
      });

    const overSinglePut = await request('photo', 'image/jpeg', 6 * MiB);
    const overPurpose = await request('avatar', 'image/jpeg', 6 * MiB);
    const wrongType = await request('avatar', 'application/pdf', 1000);

    expect(overSinglePut.status).toBe(413);
    expect(await overSinglePut.json()).toMatchObject({
      error: { code: 'PAYLOAD_TOO_LARGE', detail: { use: 'multipart' } },
    });
    expect(overPurpose.status).toBe(413);
    expect(wrongType.status).toBe(422);
    expect(await wrongType.json()).toMatchObject({
      error: { code: 'VALIDATION', detail: { reason: 'content_type_not_allowed' } },
    });
  });

  it('requires a session', async () => {
    const response = await post(undefined, '/v1/media/presign', {
      purpose: 'photo',
      content_type: 'image/jpeg',
      bytes: 10,
      sha256: sha256Hex(new Uint8Array([1])),
    });
    expect(response.status).toBe(401);
  });
});

describe('multipart uploads', () => {
  it('creates, uploads parts through presigned URLs and completes into a registered object', async () => {
    const session = await harness.signInAnonymously();
    const original = new Uint8Array(6 * MiB).map((_, index) => index % 251);
    const created = await post(session, '/v1/media/multipart', {
      purpose: 'photo',
      content_type: 'image/jpeg',
      bytes: original.byteLength,
      sha256: sha256Hex(original),
    });
    expect(created.status).toBe(200);
    const upload = (await created.json()) as {
      media_key: string;
      upload_id: string;
      part_bytes: number;
      part_count: number;
    };
    expect(upload.part_count).toBe(1);

    // Two parts: 5 MiB (the minimum for a non-final part) and the 1 MiB remainder.
    const chunks = [original.subarray(0, 5 * MiB), original.subarray(5 * MiB)];
    const encodedKey = encodeURIComponent(upload.media_key);
    const partsResponse = await post(session, `/v1/media/multipart/${encodedKey}/parts`, {
      upload_id: upload.upload_id,
      part_numbers: [1, 2],
    });
    expect(partsResponse.status).toBe(200);
    const { parts } = (await partsResponse.json()) as {
      parts: Array<{ part_number: number; url: string }>;
    };

    const etags = await Promise.all(
      parts.map(async (part, index) => {
        const response = await fetch(part.url, { method: 'PUT', body: chunks[index] ?? null });
        expect(response.status).toBe(200);
        return { part_number: part.part_number, etag: response.headers.get('etag') ?? '' };
      }),
    );

    const foreign = await harness.signInAnonymously();
    const hijack = await post(foreign, `/v1/media/multipart/${encodedKey}/complete`, {
      upload_id: upload.upload_id,
      sha256: sha256Hex(original),
      parts: etags,
    });
    expect(hijack.status).toBe(404);

    const completed = await post(session, `/v1/media/multipart/${encodedKey}/complete`, {
      upload_id: upload.upload_id,
      sha256: sha256Hex(original),
      parts: etags,
    });
    expect(completed.status).toBe(200);
    expect(await completed.json()).toEqual({
      media_key: upload.media_key,
      bytes: original.byteLength,
    });
    const { rows } = await harness.pool.query<{ bytes: string }>(
      'SELECT bytes FROM media_objects WHERE r2_key = $1',
      [upload.media_key],
    );
    expect(rows).toEqual([{ bytes: String(original.byteLength) }]);

    const retried = await post(session, `/v1/media/multipart/${encodedKey}/complete`, {
      upload_id: upload.upload_id,
      sha256: sha256Hex(original),
      parts: etags,
    });
    expect(retried.status).toBe(404);
  });
});

describe('POST /v1/media/read-urls', () => {
  async function tripWithMember(ownerUid: string, memberUid: string): Promise<string> {
    const crewId = generateUuidV7();
    await harness.pool.query('INSERT INTO crews (id, name, created_by) VALUES ($1, $2, $3)', [
      crewId,
      'Media crew',
      ownerUid,
    ]);
    for (const uid of [ownerUid, memberUid]) {
      await harness.pool.query(
        "INSERT INTO crew_members (crew_id, user_id, role, status) VALUES ($1, $2, 'member', 'active')",
        [crewId, uid],
      );
    }
    const { rows } = await harness.pool.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
      [crewId],
    );
    const tripId = rows[0]?.id ?? '';
    for (const uid of [ownerUid, memberUid]) {
      await harness.pool.query(
        "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'unopened')",
        [tripId, uid],
      );
    }
    return tripId;
  }

  it('mints verifiable 15-minute URLs for the owner and trip members, NOT_FOUND for anyone else', async () => {
    const owner = await harness.signInAnonymously();
    const member = await harness.signInAnonymously();
    const outsider = await harness.signInAnonymously();
    const presigned = await presign(owner, new TextEncoder().encode('trip photo'));

    const ownerResponse = await readUrls(owner, [presigned.media_key]);
    expect(ownerResponse.status).toBe(200);
    const minted = (await ownerResponse.json()) as {
      urls: Array<{ media_key: string; url: string }>;
      expires_at: string;
    };
    const url = new URL(minted.urls[0]?.url ?? '');
    expect(url.origin).toBe(MEDIA_BASE_URL);
    const exp = Number(url.searchParams.get('exp'));
    expect(exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(14 * 60);
    expect(exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(15 * 60);
    expect(
      await verifyMediaSignature({
        objectKey: decodeURIComponent(url.pathname.slice(1)),
        variant: url.searchParams.get('v') ?? '',
        exp,
        kid: url.searchParams.get('kid') ?? '',
        sig: url.searchParams.get('sig') ?? '',
        keys: { [KID]: HMAC_SECRET },
        now: Math.floor(Date.now() / 1000),
      }),
    ).toEqual({ status: 'ok' });

    expect((await readUrls(member, [presigned.media_key])).status).toBe(404);
    const outsiderResponse = await readUrls(outsider, [presigned.media_key]);
    expect(outsiderResponse.status).toBe(404);
    expect(await outsiderResponse.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });

    const tripId = await tripWithMember(owner.uid, member.uid);
    await harness.pool.query('UPDATE media_objects SET trip_id = $1 WHERE r2_key = $2', [
      tripId,
      presigned.media_key,
    ]);
    expect((await readUrls(member, [presigned.media_key])).status).toBe(200);
    expect((await readUrls(outsider, [presigned.media_key])).status).toBe(404);
  });

  it('refuses the whole request when any key is unknown or malformed', async () => {
    const owner = await harness.signInAnonymously();
    const presigned = await presign(owner, new TextEncoder().encode('mine'));
    const unknown = `u/${owner.uid}/photo/${generateUuidV7()}`;

    expect((await readUrls(owner, [presigned.media_key, unknown])).status).toBe(404);
    expect((await readUrls(owner, ['../etc/passwd'])).status).toBe(404);
  });
});
