import { useLoop } from '../use-loop';

export interface PingRingStyle {
  readonly key: number;
  readonly style: ReturnType<typeof useLoop>;
}

/**
 * Two radar-style expanding rings sharing the app's idle clock (docs/design-system.md §3.1 `ping`:
 * "pairs offset 1/2"), so simultaneous ping effects on screen stay coordinated rather than drifting.
 * `useLoop` already handles the reduced/off motion static frame and the `active` gate.
 */
export function usePingRings(active: boolean): readonly PingRingStyle[] {
  const ring0 = useLoop('ping', { active, offset: 0 });
  const ring1 = useLoop('ping', { active, offset: 0.5 });
  return [
    { key: 0, style: ring0 },
    { key: 1, style: ring1 },
  ];
}
