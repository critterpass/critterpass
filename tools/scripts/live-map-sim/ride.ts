/** The crewmates' walk: a fix for each along their GPX track every 5 s through `POST /v1/loc`. */
import { pointAlong, trackLength, type SimMember } from './routes';
import type { Http } from './stack';

const TICK_MS = 5000;
const log = (line: string) => process.stdout.write(`${line}\n`);

export interface RiderSession {
  readonly uid: string;
  readonly cookie: string;
}

export interface Rider {
  readonly member: SimMember;
  readonly session: RiderSession;
  readonly shareId: string;
}

/** Posts a fix for every rider now and every 5 s along their tracks; resolves the stop. */
export async function ride(
  http: Http,
  riders: readonly Rider[],
  speed: number,
): Promise<() => Promise<void>> {
  const started = Date.now();
  const tick = async () => {
    const elapsedS = (Date.now() - started) / 1000;
    await Promise.all(
      riders.map(async (rider) => {
        const travelled = rider.member.speedMps * speed * elapsedS;
        const done = travelled >= trackLength(rider.member.track);
        const at = pointAlong(rider.member.track, travelled);
        const response = await http('/v1/loc', {
          method: 'POST',
          headers: { cookie: rider.session.cookie },
          body: JSON.stringify({
            share_id: rider.shareId,
            fixes: [
              {
                lat: at.lat,
                lng: at.lng,
                acc: 8,
                activity: done ? 'stationary' : rider.member.activity,
                at: new Date().toISOString(),
                mock: 0,
              },
            ],
          }),
        });
        if (response.status !== 202 && response.status !== 429 && response.status !== 403) {
          log(`fix for ${rider.member.name}: HTTP ${response.status}`);
        }
      }),
    );
  };
  await tick();
  const timer = setInterval(() => void tick(), TICK_MS);
  return () => {
    clearInterval(timer);
    return Promise.resolve();
  };
}
