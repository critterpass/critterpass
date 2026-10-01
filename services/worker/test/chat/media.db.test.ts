/**
 * Chat media jobs against a migrated Postgres and an S3-compatible object store (RustFS standing in
 * for R2): a photo message gets its 480 px thumbnail and size, and a voice note is normalised to
 * mono AAC by ffmpeg, measured and given waveform peaks, each registered under the sender.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { StoredAttachment } from '@cp/domain';
import { AwsClient } from 'aws4fetch';
import type { PgBoss } from 'pg-boss';
import sharp from 'sharp';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { JobContext } from '../../src/boss';
import { createAvatarMediaStore, type AvatarMediaStore } from '../../src/jobs/avatar/media-store';
import { chatPhotoThumbnailJob } from '../../src/jobs/chat/photo-thumbnail';
import { chatVoiceTranscodeJob } from '../../src/jobs/chat/voice-transcode';
import { silent, startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

const run = promisify(execFile);
const S3_IMAGE = 'rustfs/rustfs:1.0.0';
const ACCESS_KEY = 'chat-test-access';
const SECRET_KEY = 'chat-test-secret-key';
const BUCKET = 'cp-media-chat-test';

let harness: JobsHarness;
let s3: StartedTestContainer;
let store: AvatarMediaStore;
let boss: PgBoss;
let sender: string;
let crewId: string;

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
  store = createAvatarMediaStore({
    endpoint,
    bucket: BUCKET,
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  });
  boss = await harness.startRuntime([]);
  sender = crypto.randomUUID();
  await harness.pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [sender]);
  const crew = await harness.pool.query<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Media', $1) RETURNING id",
    [sender],
  );
  crewId = crew.rows[0]!.id;
  await harness.pool.query('INSERT INTO crew_members (crew_id, user_id) VALUES ($1, $2)', [
    crewId,
    sender,
  ]);
}, 300_000);

afterAll(async () => {
  await harness?.stopAll();
  await harness?.close();
  await s3?.stop();
});

function context(queue: string): JobContext {
  return {
    pool: harness.pool,
    boss,
    logger: silent,
    job: {
      id: crypto.randomUUID(),
      queue,
      retryCount: 0,
      retryLimit: 3,
      isFinalAttempt: false,
      signal: new AbortController().signal,
      previousOutput: undefined,
    },
  };
}

async function messageWith(
  kind: 'photo' | 'voice',
  bytes: Uint8Array,
  contentType: string,
  extra: Partial<StoredAttachment> = {},
): Promise<{ id: string; key: string }> {
  const key = `u/${sender}/${kind}/${crypto.randomUUID()}`;
  await store.put(key, bytes, contentType);
  const media = await harness.pool.query<{ id: string }>(
    `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256, purpose)
     VALUES ($1, $2, $3, $4, repeat('b', 64), $5) RETURNING id`,
    [sender, key, contentType, bytes.byteLength, kind],
  );
  const attachment: StoredAttachment = {
    media_id: media.rows[0]!.id,
    media_key: key,
    kind,
    w: null,
    h: null,
    duration_ms: null,
    derived_key: null,
    ...extra,
  };
  const message = await harness.pool.query<{ id: string }>(
    `INSERT INTO messages (crew_id, sender_kind, sender_id, type, attachments)
     VALUES ($1, 'user', $2, $3, $4::jsonb) RETURNING id`,
    [crewId, sender, kind, JSON.stringify([attachment])],
  );
  return { id: message.rows[0]!.id, key };
}

async function attachmentOf(id: string): Promise<StoredAttachment> {
  const { rows } = await harness.pool.query<{ attachments: StoredAttachment[] }>(
    'SELECT attachments FROM messages WHERE id = $1',
    [id],
  );
  return rows[0]!.attachments[0]!;
}

describe('chat.photo_thumbnail', () => {
  it('stores a 480 px JPEG thumbnail and fills in the photo size', async () => {
    const photo = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: '#2a9d8f' },
    })
      .jpeg()
      .toBuffer();
    const { id } = await messageWith('photo', photo, 'image/jpeg');
    const job = chatPhotoThumbnailJob({ store });
    expect(await job.handler({ message_id: id }, context(job.queue))).toEqual({ rendered: 1 });
    const attachment = await attachmentOf(id);
    expect(attachment).toMatchObject({ w: 1600, h: 1200 });
    const thumb = await store.get(attachment.derived_key!);
    const meta = await sharp(Buffer.from(thumb!.bytes)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 480, 360]);
    // A retry finds the thumbnail already made.
    expect(await job.handler({ message_id: id }, context(job.queue))).toEqual({ rendered: 0 });
  });
});

describe('chat.voice_transcode', () => {
  it('normalises the note to mono AAC, measures it and draws its waveform', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'cp-voice-test-'));
    try {
      const source = path.join(dir, 'note.m4a');
      await run('ffmpeg', [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=3',
        '-ac',
        '2',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        source,
      ]);
      const { id } = await messageWith('voice', await readFile(source), 'audio/mp4', {
        duration_ms: 3000,
      });
      const job = chatVoiceTranscodeJob({ store });
      const output = await job.handler({ message_id: id }, context(job.queue));
      expect(Math.abs(Number(output?.['duration_ms']) - 3000)).toBeLessThan(150);
      const attachment = await attachmentOf(id);
      expect(attachment.peaks).toHaveLength(48);
      expect(Math.max(...attachment.peaks!)).toBe(1);
      const stored = await store.get(attachment.derived_key!);
      const probe = path.join(dir, 'out.m4a');
      await writeFile(probe, stored!.bytes);
      const { stdout } = await run('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_name,channels',
        '-of',
        'csv=p=0',
        probe,
      ]);
      expect(stdout.trim()).toBe('aac,1');
      const media = await harness.pool.query(
        'SELECT purpose FROM media_objects WHERE r2_key = $1',
        [attachment.derived_key],
      );
      expect(media.rows).toEqual([{ purpose: 'voice' }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
