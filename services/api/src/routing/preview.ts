/**
 * The route a GO preview draws from where the user stands to a place: walk and drive, each with
 * minutes, metres and the road shape, from our own Valhalla (never Mapbox). Drive minutes carry
 * the destination's drive factor, as every free-flow car time does. A mode the router cannot
 * answer (down, unset, a point off the road graph) falls back to straight-line "about" minutes
 * with no shape, and the phone hides the line.
 *
 * The origin is the phone's live position: it is routed and dropped. Nothing here reads or writes
 * the route cache (its keys would keep the position) and errors carry no coordinates.
 */
import {
  encodePolyline,
  PLAN_LEG_SHAPE_MAX_POINTS,
  PLAN_LEG_SHAPE_PRECISION,
  PLAN_LEG_SHAPE_TOLERANCE_M,
  simplifyPath,
  type LngLat,
} from '@cp/domain';
import {
  straightLineTravel,
  toMinutes,
  type PlanningTravelMode,
  type ValhallaClient,
  type ValhallaPoint,
} from '@cp/suppliers';

export interface PreviewLeg {
  readonly minutes: number;
  readonly meters: number;
  /** Encoded polyline, precision 5, simplified like a stored leg; null = no line. */
  readonly shape: string | null;
  /** A straight-line estimate: the app says "about". */
  readonly approx: boolean;
  readonly source: 'valhalla' | 'straight_line';
}

export interface RoutePreview {
  readonly walk: PreviewLeg;
  readonly drive: PreviewLeg;
}

export type PreviewRouter = Pick<ValhallaClient, 'route'>;

export function encodePreviewShape(shape: readonly LngLat[] | undefined): string | null {
  if (shape === undefined) return null;
  const simplified = simplifyPath(shape, {
    toleranceM: PLAN_LEG_SHAPE_TOLERANCE_M,
    maxPoints: PLAN_LEG_SHAPE_MAX_POINTS,
  });
  return simplified.length < 2 ? null : encodePolyline(simplified, PLAN_LEG_SHAPE_PRECISION);
}

const withFactor = (minutes: number, factor: number) =>
  minutes === 0 ? 0 : Math.max(1, Math.round(minutes * factor));

async function previewLeg(
  router: PreviewRouter | null,
  from: ValhallaPoint,
  to: ValhallaPoint,
  mode: PlanningTravelMode,
  onError?: (error: unknown) => void,
): Promise<PreviewLeg> {
  if (router !== null) {
    try {
      const answer = await router.route([from, to], mode === 'walk' ? 'pedestrian' : 'auto');
      return {
        minutes: toMinutes(answer.seconds, answer.meters),
        meters: answer.meters,
        shape: encodePreviewShape(answer.legs[0]?.shape),
        approx: false,
        source: 'valhalla',
      };
    } catch (error) {
      onError?.(error);
    }
  }
  const straight = straightLineTravel(from, to, mode);
  return {
    minutes: straight.minutes,
    meters: straight.meters,
    shape: null,
    approx: true,
    source: 'straight_line',
  };
}

export async function previewRoute(
  router: PreviewRouter | null,
  input: { readonly from: ValhallaPoint; readonly to: ValhallaPoint; readonly driveFactor: number },
  onError?: (error: unknown) => void,
): Promise<RoutePreview> {
  const [walk, drive] = await Promise.all([
    previewLeg(router, input.from, input.to, 'walk', onError),
    previewLeg(router, input.from, input.to, 'drive', onError),
  ]);
  return { walk, drive: { ...drive, minutes: withFactor(drive.minutes, input.driveFactor) } };
}
