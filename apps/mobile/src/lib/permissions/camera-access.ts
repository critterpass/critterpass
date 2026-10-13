/**
 * Where a camera screen is with the camera permission, and when it may ask. The system ask is
 * never fired while the screen is still being presented: on iOS an alert raised during a modal's
 * presentation took the screen down, showed the alert over what was behind it, and only brought
 * the screen back after Allow.
 *
 * - `live`: allowed, the preview shows;
 * - `ask`: not asked yet; a screen with its own pre-permission state waits for its tap, one
 *   without asks once it has finished presenting;
 * - `asking`: the system ask is up;
 * - `denied`: refused for good (only Settings can change it).
 */
export type CameraAccessStep = 'live' | 'ask' | 'asking' | 'denied';

export interface CameraAccessInputs {
  readonly hasPermission: boolean;
  /** The system can still ask (never asked, or asked and dismissed on Android). */
  readonly canRequestPermission: boolean;
  /** The system ask is up. */
  readonly asking: boolean;
}

export function cameraAccessStep({
  hasPermission,
  canRequestPermission,
  asking,
}: CameraAccessInputs): CameraAccessStep {
  if (hasPermission) return 'live';
  if (asking) return 'asking';
  return canRequestPermission ? 'ask' : 'denied';
}

/**
 * Whether to fire the system ask by itself now: only for a screen with no pre-permission state of
 * its own, once it has finished presenting, and once.
 */
export function asksByItself(
  step: CameraAccessStep,
  ownAskState: boolean,
  presented: boolean,
  asked: boolean,
): boolean {
  return step === 'ask' && !ownAskState && presented && !asked;
}
