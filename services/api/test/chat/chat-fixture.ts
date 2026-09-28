/**
 * Chat suites' shared set-up: the real crew and chat commands behind `/v1/cmd` and `/sync/upload`,
 * a started job producer (photo and voice sends enqueue worker jobs), and a crew started through
 * `create_crew` with members joined through the membership table.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';

import { registerChatCommands } from '../../src/commands/chat';
import { registerCrewCommands } from '../../src/commands/crews';
import { startJobProducer } from '../../src/jobs/producer';
import { runCommand } from '../location/location-fixture';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

export interface ChatHarness {
  readonly doors: CommandDoorsHarness;
  readonly producer: PgBoss;
  stop(): Promise<void>;
}

export async function startChatHarness(): Promise<ChatHarness> {
  const doors = await startCommandDoors((registry) => {
    registerCrewCommands(registry);
    registerChatCommands(registry);
  });
  const { connectionString } = (doors.pool as unknown as { options: { connectionString: string } })
    .options;
  const producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  return {
    doors,
    producer,
    async stop() {
      await producer.stop({ graceful: false });
      await doors.stop();
    },
  };
}

export interface ChatCrew {
  readonly crewId: string;
  readonly owner: SignedIn;
  readonly members: readonly SignedIn[];
}

/** A crew started by a fresh owner, with `members` more people joined. */
export async function chatCrew(doors: CommandDoorsHarness, members = 1): Promise<ChatCrew> {
  const owner = await doors.signInAnonymously();
  const crewId = generateUuidV7();
  const created = await runCommand(doors, owner, 'create_crew', { crew_id: crewId, name: 'Bali' });
  if (created.status !== 200) throw new Error(`create_crew: ${JSON.stringify(created.body)}`);
  const joined: SignedIn[] = [];
  for (let i = 0; i < members; i += 1) {
    const member = await doors.signInAnonymously();
    await withSystem(doors.pool, (tx) =>
      tx.query("INSERT INTO crew_members (crew_id, user_id, colour) VALUES ($1, $2, 'orange')", [
        crewId,
        member.uid,
      ]),
    );
    joined.push(member);
  }
  return { crewId, owner, members: joined };
}

export interface UploadOutcome {
  readonly op_id: string;
  readonly status: string;
  readonly code?: string;
  readonly result?: Record<string, unknown>;
}

/** One PowerSync upload batch for `session`, each op with its own client clock. */
export async function upload(
  doors: CommandDoorsHarness,
  session: SignedIn,
  ops: readonly ReturnType<typeof envelope>[],
): Promise<{ status: number; results: UploadOutcome[] }> {
  const response = await doors.request('/sync/upload', {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify({ ops }),
  });
  const body = (await response.json()) as { results?: UploadOutcome[] };
  return { status: response.status, results: body.results ?? [] };
}

export function sendOp(
  session: SignedIn,
  payload: Record<string, unknown>,
  options: { opId?: string; clientTs?: Date } = {},
): ReturnType<typeof envelope> {
  return envelope('send_message', payload, {
    op_id: options.opId ?? generateUuidV7(),
    actor: { uid: session.uid, via: 'offline' },
    client_ts: (options.clientTs ?? new Date()).toISOString(),
  });
}

/** Registers an uploaded media object for `uid` the way the media routes do; returns its key. */
export async function uploadedMedia(
  doors: CommandDoorsHarness,
  uid: string,
  purpose: 'photo' | 'voice',
): Promise<string> {
  const key = `u/${uid}/${purpose}/${generateUuidV7()}`;
  await withSystem(doors.pool, (tx) =>
    tx.query(
      `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256, purpose)
       VALUES ($1, $2, $3, 1024, repeat('a', 64), $4)`,
      [uid, key, purpose === 'photo' ? 'image/jpeg' : 'audio/mp4', purpose],
    ),
  );
  return key;
}

export async function sql<T>(doors: CommandDoorsHarness, text: string, params: unknown[] = []) {
  return (await doors.pool.query(text, params)).rows as T[];
}

export { runCommand };
