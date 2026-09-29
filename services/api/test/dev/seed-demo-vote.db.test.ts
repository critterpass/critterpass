/**
 * The demo seed's destination vote on a real database: the caller organises an open board with
 * four places (one their own) and the crewmates' ballots 2–2, drives it to the final with the real
 * `advance_poll_stage`, and closes it with their own `cast_ballot`; `vote_final` starts straight
 * in the final, and a reseed puts a final back on its board.
 */
import type { PgBoss } from 'pg-boss';
import { pitchSectionsSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPollCommands } from '../../src/commands/polls';
import { registerDevRoutes } from '../../src/dev/routes';
import { routeNotificationsFromApiEvents, startJobProducer } from '../../src/jobs/producer';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let producer: PgBoss;
let caller: SignedIn;
const logger = { info: () => undefined, warn: () => undefined };

beforeAll(async () => {
  harness = await startCommandDoors(registerPollCommands, (app, deps) =>
    registerDevRoutes(app, { ...deps, appEnv: 'staging', logger }),
  );
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  routeNotificationsFromApiEvents();
  caller = await harness.signInAnonymously();
}, 240_000);

afterAll(async () => {
  await producer.stop({ graceful: false });
  await harness.stop();
});

async function seed(scenario: string): Promise<{ poll_id: string }> {
  const response = await harness.request('/v1/dev/seed-demo', {
    method: 'POST',
    headers: { cookie: caller.cookie },
    body: JSON.stringify({ scenario }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { poll_id: string };
}

async function send(cmd: string, payload: unknown) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: caller.cookie },
    body: JSON.stringify(envelope(cmd, payload)),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function poll(pollId: string) {
  const { rows } = await harness.pool.query<{
    stage: string;
    status: string;
    organiser: boolean;
    winner: string | null;
  }>(
    `SELECT p.stage, p.status, p.created_by = $2 AS organiser,
            (SELECT d.slug FROM poll_options o JOIN destinations d ON d.id = o.ref_id
              WHERE o.id = p.winner_option_id) AS winner
       FROM polls p WHERE p.id = $1`,
    [pollId, caller.uid],
  );
  const places = await harness.pool.query<{ slug: string; votes: number; mine: boolean }>(
    `SELECT d.slug, count(b.user_id)::int AS votes, bool_or(pi.pitched_by = $2) AS mine
       FROM poll_options o JOIN destinations d ON d.id = o.ref_id
       LEFT JOIN pitches pi ON pi.id = o.pitch_id
       LEFT JOIN ballots b ON b.option_id = o.id
      WHERE o.poll_id = $1 AND o.eliminated_at IS NULL
      GROUP BY d.slug ORDER BY d.slug`,
    [pollId, caller.uid],
  );
  return { ...rows[0], places: places.rows };
}

async function optionFor(pollId: string, slug: string): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(
    `SELECT o.id FROM poll_options o JOIN destinations d ON d.id = o.ref_id
      WHERE o.poll_id = $1 AND d.slug = $2`,
    [pollId, slug],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no option for ${slug}`);
  return id;
}

describe('demo seed destination vote', { timeout: 120_000 }, () => {
  it('opens a board the caller organises and drives it to a reveal alone', async () => {
    const { poll_id } = await seed('vote');
    expect(await poll(poll_id)).toEqual({
      stage: 'board',
      status: 'open',
      organiser: true,
      winner: null,
      places: [
        { slug: 'iceland', votes: 0, mine: false },
        { slug: 'kyoto', votes: 2, mine: true },
        { slug: 'lisbon', votes: 2, mine: false },
        { slug: 'mexico-city', votes: 0, mine: false },
      ],
    });

    expect((await send('advance_poll_stage', { poll_id })).status).toBe(200);
    expect((await poll(poll_id)).places.map((place) => place.slug)).toEqual(['kyoto', 'lisbon']);

    const ballot = await send('cast_ballot', {
      poll_id,
      option_id: await optionFor(poll_id, 'kyoto'),
    });
    expect(ballot.status).toBe(200);
    expect(await poll(poll_id)).toMatchObject({ status: 'closed', winner: 'kyoto' });
  });

  it("gives the finalists' pitches the guide's quote and the tool chips, once", async () => {
    const { poll_id } = await seed('vote_final');
    const sectionsOf = async () => {
      const { rows } = await harness.pool.query<{ slug: string; sections: unknown }>(
        `SELECT d.slug, p.sections FROM poll_options o
           JOIN destinations d ON d.id = o.ref_id JOIN pitches p ON p.id = o.pitch_id
          WHERE o.poll_id = $1 AND o.eliminated_at IS NULL ORDER BY d.slug`,
        [poll_id],
      );
      return rows;
    };
    const finalists = await sectionsOf();
    expect(finalists.map((row) => row.slug)).toEqual(['kyoto', 'lisbon']);
    for (const row of finalists) {
      const sections = pitchSectionsSchema.parse(row.sections);
      expect(sections.quote).not.toBeNull();
      expect(sections.chips.map((chip) => chip.kind)).toEqual(['flight', 'price', 'best_months']);
    }
    expect(pitchSectionsSchema.parse(finalists[0]?.sections).quote).toBe(
      'Come in April. The blossoms are ridiculous.',
    );
    await seed('vote_final');
    expect(await sectionsOf()).toEqual(finalists);
  });

  it('starts a new vote in its final, and a reseed puts it back on the board', async () => {
    const { poll_id } = await seed('vote_final');
    expect(await poll(poll_id)).toMatchObject({
      stage: 'final',
      status: 'open',
      places: [
        { slug: 'kyoto', votes: 2 },
        { slug: 'lisbon', votes: 2 },
      ],
    });

    const again = await seed('vote');
    expect(again.poll_id).toBe(poll_id);
    expect(await poll(poll_id)).toMatchObject({ stage: 'board', status: 'open' });
    expect((await poll(poll_id)).places).toHaveLength(4);

    await seed('vote_final');
    const ballot = await send('cast_ballot', {
      poll_id,
      option_id: await optionFor(poll_id, 'lisbon'),
    });
    expect(ballot.status).toBe(200);
    expect(await poll(poll_id)).toMatchObject({ status: 'closed', winner: 'lisbon' });
  });
});
