/**
 * Editorial media end to end against a migrated Postgres, an S3-compatible store (RustFS standing
 * in for R2) and a local HTTP server standing in for the stock source: publishing a media release
 * writes the assets and queues their ingest; the ingest job stores WebP stills (and for a video an
 * H.264 loop and poster made by the real ffmpeg) under c/media/<id>/ and marks the asset ready.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { buildRelease, type ContentItem } from '@cp/content';
import { withSystem } from '@cp/db';
import { isBlurhash, type MediaVariant } from '@cp/domain';
import { AwsClient } from 'aws4fetch';
import sharp from 'sharp';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { publishRelease } from '../../src/content/publish';
import { createAvatarMediaStore, type AvatarMediaStore } from '../../src/jobs/avatar/media-store';
import { ingestAsset } from '../../src/jobs/media/ingest';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

const run = promisify(execFile);
const S3_IMAGE = 'rustfs/rustfs:1.0.0';
const ACCESS_KEY = 'media-test-access';
const SECRET_KEY = 'media-test-secret-key';
const BUCKET = 'cp-media-ingest-test';

let harness: JobsHarness;
let s3: StartedTestContainer;
let store: AvatarMediaStore;
let server: Server;
let origin: string;
const files = new Map<string, { body: Buffer; type: string }>();

beforeAll(async () => {
  [harness, s3] = await Promise.all([
    startJobsHarness(),
    new GenericContainer(S3_IMAGE)
      .withEnvironment({ RUSTFS_ACCESS_KEY: ACCESS_KEY, RUSTFS_SECRET_KEY: SECRET_KEY })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/health', 9000).forStatusCode(200))
      .start(),
  ]);
  const endpoint = `http://${s3.getHost()}:${s3.getMappedPort(9000)}`;
  const admin = new AwsClient({
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    service: 's3',
    region: 'auto',
  });
  const created = await admin.fetch(`${endpoint}/${BUCKET}`, { method: 'PUT' });
  if (!created.ok) throw new Error(`bucket create failed: ${created.status}`);
  // The publish transaction enqueues through the process's job producer.
  await harness.startRuntime([]);
  store = createAvatarMediaStore({
    endpoint,
    bucket: BUCKET,
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  });
  files.set('/photo.jpg', {
    body: await sharp({ create: { width: 2000, height: 1333, channels: 3, background: '#1d6fa5' } })
      .jpeg()
      .toBuffer(),
    type: 'image/jpeg',
  });
  const dir = await mkdtemp(path.join(tmpdir(), 'cp-media-test-'));
  try {
    const clip = path.join(dir, 'clip.mp4');
    await run('ffmpeg', [
      '-hide_banner',
      '-nostdin',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=1920x1080:rate=30',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440',
      '-t',
      '12',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-shortest',
      clip,
    ]);
    files.set('/clip.mp4', { body: await readFile(clip), type: 'video/mp4' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  server = createServer((request, response) => {
    const file = files.get(request.url ?? '');
    if (file === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': file.type, 'content-length': file.body.length });
    response.end(file.body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 300_000);

afterAll(async () => {
  server.close();
  await harness.stopAll();
  await harness.close();
  await s3.stop();
});

/** The stock source, reached over plain HTTP in the test: rewrite the https URL to the server. */
const toServer: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return fetch(url.replace('https://stock.test', origin), init);
};

function candidate(
  kind: 'photo' | 'video',
  sourceId: string,
  file: string,
  subjects = ['destination:da-nang'],
): ContentItem<'media'> {
  return {
    id: `pexels-${kind}-${sourceId}`,
    kind,
    source: 'pexels',
    source_id: sourceId,
    source_url: `https://www.pexels.com/${kind}/${sourceId}/`,
    download_url: `https://stock.test${file}`,
    preview_url: `https://stock.test${file}`,
    subjects,
    rank: 0,
    title: null,
    author: 'Someone',
    author_url: null,
    licence: 'pexels',
    licence_url: 'https://www.pexels.com/license/',
    attribution_required: false,
    credit: `${kind === 'video' ? 'Video' : 'Photo'}: Someone · Pexels`,
    width: 2000,
    height: 1333,
    duration_ms: kind === 'video' ? 12_000 : null,
  };
}

let version = 0;
async function publish(items: readonly ContentItem<'media'>[]): Promise<string> {
  version += 1;
  const artifact = buildRelease({
    kind: 'media',
    version,
    items,
    generated_by: {
      batch_key: `media-${version}`,
      route: null,
      model: null,
      generated_at: '2026-10-01T00:00:00Z',
    },
    approved_by: randomUUID(),
  });
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
       item_count, approved_by, approved_at)
     VALUES ('media', $1, $2, $2, 'approved', 'approve', $3, $4, $5, $6, now()) RETURNING id`,
    [
      version,
      `media-${version}-${randomUUID()}`,
      artifact.checksum,
      JSON.stringify(artifact),
      items.length,
      artifact.approved_by,
    ],
  );
  const id = rows[0]!.id;
  await withSystem(harness.pool, (tx) => publishRelease(tx, id));
  return id;
}

interface AssetRow {
  id: string;
  source_id: string;
  status: string;
  blurhash: string | null;
  colour: string | null;
  variants: MediaVariant[];
  poster_key: string | null;
  error: string | null;
}

async function assets(): Promise<AssetRow[]> {
  const { rows } = await harness.pool.query<AssetRow>(
    'SELECT id, source_id, status, blurhash, colour, variants, poster_key, error FROM media_assets ORDER BY source_id',
  );
  return rows;
}

describe('media publish and ingest', { timeout: 180_000 }, () => {
  it('writes the kept assets and queues one ingest each', async () => {
    await publish([candidate('photo', '1', '/photo.jpg'), candidate('video', '2', '/clip.mp4')]);
    const rows = await assets();
    expect(rows.map((r) => [r.source_id, r.status])).toEqual([
      ['1', 'pending'],
      ['2', 'pending'],
    ]);
    const { rows: jobs } = await harness.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'media.ingest'",
    );
    expect(jobs[0]!.n).toBe(2);
  });

  it('stores WebP stills and a blurhash for a photo', async () => {
    const photo = (await assets()).find((r) => r.source_id === '1')!;
    expect(await ingestAsset(harness.pool, photo.id, { store, fetch: toServer })).toEqual({
      status: 'ready',
      variants: 4,
    });
    const ready = (await assets()).find((r) => r.id === photo.id)!;
    expect(isBlurhash(ready.blurhash!)).toBe(true);
    expect(ready.colour).toMatch(/^#[0-9a-f]{6}$/u);
    expect(ready.variants.map((v) => v.w)).toEqual([480, 828, 1242, 1656]);
    const stored = await store.get(ready.variants[0]!.key);
    expect(stored?.contentType).toBe('image/webp');
    expect((await sharp(Buffer.from(stored!.bytes)).metadata()).width).toBe(480);
    // A retry finds it done.
    expect(await ingestAsset(harness.pool, photo.id, { store, fetch: toServer })).toEqual({
      status: 'ready',
    });
  });

  it('cuts a muted 8-second loop per width and a poster for a video', async () => {
    const video = (await assets()).find((r) => r.source_id === '2')!;
    await ingestAsset(harness.pool, video.id, { store, fetch: toServer });
    const ready = (await assets()).find((r) => r.id === video.id)!;
    expect(ready.status).toBe('ready');
    const loops = ready.variants.filter((v) => v.format === 'mp4');
    expect(loops.map((v) => v.w)).toEqual([720, 1280]);
    for (const loop of loops) expect(loop.bytes).toBeLessThan(2_500_000);
    expect(ready.poster_key).toBe(ready.variants.filter((v) => v.format === 'webp').at(-1)!.key);
    const dir = await mkdtemp(path.join(tmpdir(), 'cp-media-probe-'));
    try {
      const file = path.join(dir, 'loop.mp4');
      await writeFile(file, (await store.get(loops[1]!.key))!.bytes);
      const { stdout } = await run('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type,codec_name:format=duration',
        '-of',
        'json',
        file,
      ]);
      const probe = JSON.parse(stdout) as {
        streams: { codec_type: string; codec_name: string }[];
        format: { duration: string };
      };
      expect(probe.streams.map((s) => s.codec_type)).toEqual(['video']);
      expect(probe.streams[0]!.codec_name).toBe('h264');
      expect(Number(probe.format.duration)).toBeCloseTo(8, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('marks an asset whose source file is gone as failed', async () => {
    await publish([
      candidate('photo', '1', '/photo.jpg'),
      candidate('video', '2', '/clip.mp4'),
      candidate('photo', '3', '/missing.jpg'),
    ]);
    const missing = (await assets()).find((r) => r.source_id === '3')!;
    expect(await ingestAsset(harness.pool, missing.id, { store, fetch: toServer })).toEqual({
      status: 'failed',
    });
    const row = (await assets()).find((r) => r.id === missing.id)!;
    expect(row.status).toBe('failed');
    expect(row.error).toMatch(/gone/u);
  });

  it('keeps ready assets through a re-publish and drops the ones it no longer has', async () => {
    await publish([
      candidate('photo', '1', '/photo.jpg', ['destination:da-nang', 'poi:dragon-bridge']),
    ]);
    const rows = await assets();
    expect(rows.map((r) => [r.source_id, r.status])).toEqual([['1', 'ready']]);
    const { rows: subjects } = await harness.pool.query<{ subject_keys: string[] }>(
      'SELECT subject_keys FROM media_assets',
    );
    expect(subjects[0]!.subject_keys).toEqual(['destination:da-nang', 'poi:dragon-bridge']);
  });
});
