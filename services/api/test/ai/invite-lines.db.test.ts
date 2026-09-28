/**
 * The guide's invite lines over the real doors and a migrated Postgres, with DeepSeek and Jev
 * answered by recorded replies at the network boundary: a member's note gets the guide's tags and
 * line (metered as usage), a note the compliance check flags or a switched-off route gets the
 * template instead, outsiders see nothing, and a newcomer's welcome line names their crew.
 */
import { createGateway, recordUsage } from '@cp/ai';
import { fixtureTransport, type FixtureTransport } from '@cp/ai/testing';
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApiCompliance } from '../../src/ai/compliance';
import { registerInviteLineRoutes } from '../../src/ai/invite-lines';
import { registerCrewCommands } from '../../src/commands/crews';
import { createKillSwitches } from '../../src/ops/kill-switches';
import { runCommand } from '../location/location-fixture';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let deepseek: FixtureTransport = fixtureTransport([]);
let jev: FixtureTransport = fixtureTransport([], { dir: 'typesafe' });
let clock = Date.now();
let owner: SignedIn;
let crewId: string;

const silent = { warn: () => undefined };

beforeAll(async () => {
  harness = await startCommandDoors(registerCrewCommands, (app, deps) => {
    const switches = createKillSwitches(deps.pool, { now: () => new Date(clock) });
    const gateway = createGateway({
      apiKey: 'fixture-key',
      maxAttempts: 1,
      fetch: (input, init) => deepseek.fetch(input, init),
      assertRouteOn: switches.assertAiRoute,
      onUsage: (record) => recordUsage((fn) => withSystem(deps.pool, fn), record),
    });
    const compliance = createApiCompliance({
      pool: deps.pool,
      typesafeApiKey: 'fixture-key',
      gateway,
      switches,
      logger: silent,
      fetch: (input, init) => jev.fetch(input, init),
    });
    registerInviteLineRoutes(app, { ...deps, gateway, compliance });
  });
  owner = await harness.signInAnonymously();
  await harness.pool.query("UPDATE users SET display_name = 'Dev Tan' WHERE id = $1", [owner.uid]);
  crewId = generateUuidV7();
  const created = await runCommand(harness, owner, 'create_crew', {
    crew_id: crewId,
    name: 'Bali Bandits',
  });
  expect(created.status).toBe(200);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

beforeEach(async () => {
  await harness.pool.query("DELETE FROM ops.ops_config WHERE key LIKE 'ai.%.enabled'");
  clock += 10 * 60_000;
});

async function post(who: SignedIn | null, path: string, body: unknown) {
  const response = await harness.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(who === null ? {} : { cookie: who.cookie }),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const NOTE = { note: 'loves night markets and street food', invitee_name: 'Dev' };

describe('POST /v1/invites/tags', () => {
  it("answers a member with the guide's tags and line, and meters the call", async () => {
    deepseek = fixtureTransport(['invite-tags-01']);
    jev = fixtureTransport(['jev-compliance-killing-time'], { dir: 'typesafe' });
    const answer = await post(owner, '/v1/invites/tags', { crew_id: crewId, ...NOTE });
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({
      tags: ['markets', 'street_food'],
      line: "Dev's a night market wanderer, and I know a guy.",
      guide: 'tokek',
      source: 'model',
    });
    expect(JSON.stringify(deepseek.requests[0])).toContain('night markets');
    const { rows } = await harness.pool.query(
      "SELECT route FROM ai_usage WHERE user_id = $1 AND route = 'micro.line'",
      [owner.uid],
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('answers a flagged note with the keyword template', async () => {
    deepseek = fixtureTransport(['invite-tags-01']);
    jev = fixtureTransport(['jev-compliance-guide-injected-email'], { dir: 'typesafe' });
    const answer = await post(owner, '/v1/invites/tags', { crew_id: crewId, ...NOTE });
    expect(answer.body).toMatchObject({ tags: ['markets', 'street_food'], source: 'template' });
  });

  it('answers the template without calling the model while the route is switched off', async () => {
    await harness.pool.query(
      "INSERT INTO ops.ops_config (key, value) VALUES ('ai.micro.line.enabled', 'false'::jsonb)",
    );
    deepseek = fixtureTransport([]);
    jev = fixtureTransport(['jev-compliance-killing-time'], { dir: 'typesafe' });
    const answer = await post(owner, '/v1/invites/tags', { crew_id: crewId, ...NOTE });
    expect(answer.body).toMatchObject({ source: 'template' });
    expect(deepseek.urls).toEqual([]);
  });

  it('shows nothing to outsiders, the signed out or a malformed note', async () => {
    const outsider = await harness.signInAnonymously();
    expect((await post(outsider, '/v1/invites/tags', { crew_id: crewId, ...NOTE })).status).toBe(
      404,
    );
    expect((await post(null, '/v1/invites/tags', { crew_id: crewId, ...NOTE })).status).toBe(401);
    const long = { crew_id: crewId, note: 'x'.repeat(141), invitee_name: 'Dev' };
    expect((await post(owner, '/v1/invites/tags', long)).status).toBe(422);
  });
});

describe('POST /v1/crews/{crew_id}/welcome', () => {
  it("writes the newcomer's welcome in the guide's voice", async () => {
    deepseek = fixtureTransport(['crew-welcome-01']);
    const answer = await post(owner, `/v1/crews/${crewId}/welcome`, {});
    expect(answer.status).toBe(200);
    expect(answer.body['source']).toBe('model');
    expect(String(answer.body['line']).length).toBeLessThanOrEqual(90);
    const sent = JSON.stringify(deepseek.requests[0]);
    expect(sent).toContain('Newcomer: Dev');
    expect(sent).toContain('Crew: Bali Bandits');
  });

  it('falls back to the template when the model fails, and hides other crews', async () => {
    deepseek = fixtureTransport(['jev-overloaded-529'], { dir: 'typesafe' });
    const answer = await post(owner, `/v1/crews/${crewId}/welcome`, {});
    expect(answer.body).toEqual({
      line: 'Welcome aboard, Dev. Bali Bandits is 1 strong now.',
      source: 'template',
    });
    const outsider = await harness.signInAnonymously();
    expect((await post(outsider, `/v1/crews/${crewId}/welcome`, {})).status).toBe(404);
  });
});
