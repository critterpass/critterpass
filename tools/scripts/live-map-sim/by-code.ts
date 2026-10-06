import { joinTraveller, sendCommand, type ApiClient } from '../seed-trip-day';
import { ride, type Rider } from './ride';
import { crewMembers } from './routes';
import type { Http } from './stack';

const log = (line: string) => process.stdout.write(`${line}\n`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Staging device runs: the crew and trips come from the api's dev seed (`POST
 * /v1/dev/seed-live-map`, through the app's Developer tools). The crewmates sign up, join with the
 * crew code, take a seat on the boosted trip, share, set the meet-up and keep walking. Prints one
 * JSON line once they move (the shard's runner waits for it).
 */
export async function driveByCode(args: {
  readonly api: string;
  readonly code: string;
  readonly trip: string;
  readonly poi: string;
  readonly speed: number;
  readonly minutes: number;
}): Promise<void> {
  const baseUrl = args.api.replace(/\/+$/, '');
  const api: ApiClient = { baseUrl, fetch };
  const http: Http = (path, init = {}) => {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  };
  const riders: Rider[] = [];
  for (const member of crewMembers()) {
    const session = await joinTraveller(api, member.name, args.code);
    try {
      await sendCommand(api, session, 'join_trip', { trip_id: args.trip });
    } catch (error) {
      // The code can seat them on the trip already; anything else shows up at the share below.
      log(
        `join_trip for ${member.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const share = await sendCommand(api, session, 'set_location_share', {
      trip_id: args.trip,
      status: 'on',
    });
    riders.push({ member, session, shareId: share['share_id'] as string });
  }
  const organiser = riders[0]?.session;
  if (organiser === undefined) throw new Error('the sim crew is empty');
  const meetup = await sendCommand(api, organiser, 'create_meetup', {
    trip_id: args.trip,
    poi_id: args.poi,
    at: new Date(Date.now() + 20 * 60_000).toISOString(),
  });
  const stop = await ride(http, riders, args.speed);
  log(
    JSON.stringify({
      trip_id: args.trip,
      meetup_id: meetup['id'],
      members: riders.map((rider) => ({ uid: rider.session.uid, name: rider.member.name })),
    }),
  );
  await sleep(args.minutes * 60_000);
  await stop();
}
