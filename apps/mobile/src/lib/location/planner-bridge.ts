/**
 * Feeds the domain geofence planner from the engine: re-plans after a 1 km move or every 15
 * minutes (or when the OS says the device left the re-plan boundary), hands the regions to the
 * native monitor when regions are on, and answers "is this fix inside a planned place" for the
 * battery budget.
 */
import {
  ANDROID_GEOFENCE_LIMIT,
  distanceM,
  geofenceSources,
  IOS_MONITOR_LIMIT,
  planGeofences,
  REPLAN_REGION_ID,
  shouldReplan,
  type GeofencePlan,
  type GeofenceSourceContext,
  type GeofenceSourceRegistry,
} from '@cp/domain';

import type { EngineFix, EngineRegionEvent, LocationSessionPort } from './ports';

export interface PlannerBridgeOptions {
  readonly session: LocationSessionPort;
  readonly platform: 'ios' | 'android';
  readonly context: () => GeofenceSourceContext | null;
  readonly now: () => number;
  readonly sources?: GeofenceSourceRegistry;
}

export function createPlannerBridge(options: PlannerBridgeOptions) {
  const sources = options.sources ?? geofenceSources;
  let plan: GeofencePlan | null = null;
  let forced = false;
  let regionsOn = false;

  async function replan(position: EngineFix): Promise<void> {
    const ctx = options.context();
    if (ctx === null) return;
    plan = planGeofences(position, sources.collect(ctx), options.now(), {
      max: options.platform === 'ios' ? IOS_MONITOR_LIMIT : ANDROID_GEOFENCE_LIMIT,
      // iOS relaunches a terminated app on a region exit: the boundary brings the plan along.
      replanRegion: options.platform === 'ios',
    });
    forced = false;
    if (regionsOn) await options.session.monitorRegions(plan.regions);
  }

  return {
    setRegionsEnabled(enabled: boolean): Promise<void> {
      const changed = enabled !== regionsOn;
      regionsOn = enabled;
      if (!changed) return Promise.resolve();
      if (!enabled) return options.session.clearRegions();
      return plan === null
        ? Promise.resolve()
        : options.session.monitorRegions(plan.regions).then(() => undefined);
    },
    onFix(fix: EngineFix): Promise<void> {
      if (!forced && !shouldReplan(plan, fix, options.now())) return Promise.resolve();
      return replan(fix);
    },
    onRegion(event: EngineRegionEvent): void {
      if (event.id === REPLAN_REGION_ID && event.event === 'exit') forced = true;
    },
    /** Inside any planned place (the re-plan boundary does not count). */
    isInside(fix: EngineFix): boolean {
      return (
        plan?.regions.some((r) => r.id !== REPLAN_REGION_ID && distanceM(r, fix) <= r.radiusM) ??
        false
      );
    },
    currentPlan: (): GeofencePlan | null => plan,
    reset(): void {
      plan = null;
      forced = false;
    },
  };
}

export type PlannerBridge = ReturnType<typeof createPlannerBridge>;
