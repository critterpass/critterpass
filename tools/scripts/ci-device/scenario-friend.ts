/**
 * One simulated friend acts on the crew under test through the real api, the way their own phone
 * would, so a device flow never has to switch accounts on the phone to be someone else:
 *
 *   join         signs up, issues a pass and joins the crew behind `--code`
 *   board        says IN to the trip's sent proposal
 *   drop-out     says OUT to it
 *   answer-poll  votes for the first option still standing in the crew's open poll
 *
 * The friend is the same person across calls for one crew code: `join` keeps their session in a
 * file under the runner's temp directory, and the other actions read it (joining first when there
 * is none). Ids come from the sync service, as a phone learns them.
 *
 *   pnpm tsx tools/scripts/ci-device/scenario-friend.ts --api https://api-staging-de92.up.railway.app \
 *       --code K7M2QX --action board
 *
 * Prints one JSON line: `{"action": …, "uid": …, "name": …, "trip_id"?, "proposal_id"?, "poll_id"?,
 * "option_id"?}`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { readSyncedRows, waitForSyncedRow, type SyncedRow } from '../seed-sync-rows';
import { joinTraveller, sendCommand, type ApiClient, type ApiSession } from '../seed-trip-day';

export const FRIEND_ACTIONS = ['join', 'board', 'drop-out', 'answer-poll'] as const;
export type FriendAction = (typeof FRIEND_ACTIONS)[number];
export const FRIEND_NAME = 'Friend Sim';

export interface FriendResult {
  readonly action: FriendAction;
  readonly uid: string;
  readonly name: string;
  readonly trip_id?: string;
  readonly proposal_id?: string;
  readonly poll_id?: string;
  readonly option_id?: string;
}

export function isFriendAction(value: string | undefined): value is FriendAction {
  return FRIEND_ACTIONS.some((action) => action === value);
}

/** Where a crew's friend keeps their session between calls. */
export function sessionFile(code: string, dir: string = tmpdir()): string {
  return path.join(dir, `cp-scenario-friend-${code.toUpperCase()}.json`);
}

function readSession(file: string): ApiSession | undefined {
  if (!existsSync(file)) return undefined;
  const saved = JSON.parse(readFileSync(file, 'utf8')) as Partial<ApiSession>;
  return typeof saved.uid === 'string' && typeof saved.cookie === 'string'
    ? { uid: saved.uid, cookie: saved.cookie }
    : undefined;
}

/** The friend's session for this crew: the saved one, or a new traveller who joins now. */
async function friendOf(api: ApiClient, code: string, file: string): Promise<ApiSession> {
  const saved = readSession(file);
  if (saved !== undefined) return saved;
  const joined = await joinTraveller(api, FRIEND_NAME, code);
  const session = { uid: joined.uid, cookie: joined.cookie };
  writeFileSync(file, JSON.stringify(session), { mode: 0o600 });
  return session;
}

/** The trip a proposal can be out on: the newest one still waiting for replies, else the newest. */
export function proposalTrip(trips: readonly SyncedRow[]): SyncedRow | undefined {
  const newestFirst = [...trips].sort((a, b) =>
    String(b['created_at']).localeCompare(String(a['created_at'])),
  );
  return newestFirst.find((trip) => trip['status'] === 'proposed') ?? newestFirst[0];
}

/** The proposal the crew is answering: the latest one sent that nothing has replaced. */
export function sentProposal(proposals: readonly SyncedRow[]): SyncedRow | undefined {
  return proposals
    .filter((proposal) => proposal['sent_at'] != null && proposal['status'] !== 'superseded')
    .sort((a, b) => String(b['sent_at']).localeCompare(String(a['sent_at'])))[0];
}

/** The crew's open poll, newest first. */
export function openPoll(polls: readonly SyncedRow[]): SyncedRow | undefined {
  return polls
    .filter((poll) => poll['status'] === 'open')
    .sort((a, b) => String(b['created_at']).localeCompare(String(a['created_at'])))[0];
}

/** The first option of the poll that has not been eliminated. */
export function firstOption(options: readonly SyncedRow[], pollId: string): SyncedRow | undefined {
  return options
    .filter((option) => option['poll_id'] === pollId && option['eliminated_at'] == null)
    .sort((a, b) => Number(a['position']) - Number(b['position']))[0];
}

async function reply(
  api: ApiClient,
  friend: ApiSession,
  status: 'in' | 'out',
): Promise<Pick<FriendResult, 'trip_id' | 'proposal_id'>> {
  const trip = await waitForSyncedRow(
    () => readSyncedRows(api, friend, 'trips'),
    proposalTrip,
    'the trip',
  );
  const proposal = await waitForSyncedRow(
    () =>
      readSyncedRows(api, friend, 'proposals', {
        subscriptions: [{ stream: 'trip', parameters: { trip_id: trip.id } }],
      }),
    sentProposal,
    'the sent proposal',
  );
  await sendCommand(api, friend, 'set_rsvp', { proposal_id: proposal.id, status });
  return { trip_id: trip.id, proposal_id: proposal.id };
}

async function answerPoll(
  api: ApiClient,
  friend: ApiSession,
): Promise<Pick<FriendResult, 'poll_id' | 'option_id'>> {
  const poll = await waitForSyncedRow(
    () => readSyncedRows(api, friend, 'polls'),
    openPoll,
    'an open poll',
  );
  const option = await waitForSyncedRow(
    () => readSyncedRows(api, friend, 'poll_options'),
    (rows) => firstOption(rows, poll.id),
    'an option to vote for',
  );
  await sendCommand(api, friend, 'cast_ballot', { poll_id: poll.id, option_id: option.id });
  return { poll_id: poll.id, option_id: option.id };
}

export async function actAsFriend(
  api: ApiClient,
  code: string,
  action: FriendAction,
  file: string = sessionFile(code),
): Promise<FriendResult> {
  const friend = await friendOf(api, code.toUpperCase(), file);
  const who = { action, uid: friend.uid, name: FRIEND_NAME };
  if (action === 'join') return who;
  if (action === 'answer-poll') return { ...who, ...(await answerPoll(api, friend)) };
  return { ...who, ...(await reply(api, friend, action === 'board' ? 'in' : 'out')) };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      api: { type: 'string' },
      code: { type: 'string' },
      action: { type: 'string' },
    },
  });
  const { api: baseUrl, code, action } = values;
  if (baseUrl === undefined || code === undefined || !isFriendAction(action)) {
    throw new Error(
      `usage: scenario-friend.ts --api <url> --code <crew code> --action ${FRIEND_ACTIONS.join('|')}`,
    );
  }
  const api: ApiClient = { baseUrl: baseUrl.replace(/\/$/, ''), fetch };
  process.stdout.write(`${JSON.stringify(await actAsFriend(api, code, action))}\n`);
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
