/**
 * What the SOS session map shows: where the person who needs help is (their SOS share's latest
 * fix), where this phone is, the line between them, the walking minutes the server counted for
 * this responder, and the destination's tiles. It needs no Boost and shows no upsell: the map is
 * part of the SOS and ends with it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and tile URLs, never copy. */
import criterpassDarkStyleJson from '../../../../assets/map-style/critterpass-dark.json';
import { useLiveRows } from '../data/live-rows';
import type { SosModel } from '../sos/sos-model';
import { useSos } from '../sos/use-sos';
import { frame, straightLine, type Point } from './walking-route';

const WORLD_URL = (
  (criterpassDarkStyleJson as { sources: Record<string, { url?: string }> }).sources['world']
    ?.url ?? ''
).replace(/^pmtiles:\/\//u, '');

const SLUG_SQL = `
  SELECT d.slug FROM trips t JOIN destinations d ON d.id = t.destination_id WHERE t.id = ?`;

export interface SessionMap {
  readonly loaded: boolean;
  readonly model: SosModel | null;
  readonly sender: Point | null;
  readonly here: Point | null;
  readonly line: readonly (readonly [number, number])[] | null;
  readonly centre: Point | null;
  readonly zoom: number;
  /** Walking minutes to the sender, once this person said they are going and the server counted. */
  readonly etaMin: number | null;
  readonly distanceM: number | null;
  readonly regionSourceUrl: string | undefined;
  /** The incident is over (or was never alerted): the map has nothing live to show. */
  readonly ended: boolean;
}

export function useSessionMap(sosId: string | null): SessionMap {
  const sos = useSos(sosId);
  const slug =
    useLiveRows<{ slug: string | null }>(SLUG_SQL, sos.row === null ? null : [sos.row.trip_id], [
      'trips',
      'destinations',
    ]).rows[0]?.slug ?? null;
  const model = sos.model;
  const me = model?.responders.find((responder) => responder.uid === sos.uid) ?? null;
  const framed = sos.senderAt === null ? null : frame(sos.here, sos.senderAt);
  return {
    loaded: sos.loaded,
    model,
    sender: sos.senderAt,
    here: sos.here,
    line: straightLine(sos.here, sos.senderAt),
    centre: framed?.centre ?? sos.here,
    zoom: framed?.zoom ?? 15,
    etaMin: me?.etaMin ?? null,
    distanceM: sos.distanceM,
    regionSourceUrl:
      slug === null || WORLD_URL === '' ? undefined : WORLD_URL.replace('/world/', `/${slug}/`),
    ended: model !== null && model.state !== 'open',
  };
}
