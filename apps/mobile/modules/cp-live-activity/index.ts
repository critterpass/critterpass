/**
 * Live Activities on the device (iOS; Android Live Updates arrive as FCM data and are drawn by the
 * notifications module). Every call is safe in a binary built without this module: the port is
 * then `null` and the app registers nothing.
 */
import type { EventSubscription } from 'expo';

import {
  nativeCpLiveActivityModule,
  type NativeLaActivity,
  type NativeLaAuthorization,
  type NativeLaEndRequest,
  type NativeLaKind,
  type NativeLaStartRequest,
  type NativeLaState,
  type NativeLaUpdateRequest,
} from './src/CpLiveActivityModule';

export type {
  NativeLaActivity as LiveActivity,
  NativeLaAuthorization as LiveActivityAuthorization,
  NativeLaEndRequest as LiveActivityEndRequest,
  NativeLaKind as LiveActivityKind,
  NativeLaStartRequest as LiveActivityStartRequest,
  NativeLaState as LiveActivityState,
  NativeLaUpdateRequest as LiveActivityUpdateRequest,
};

export interface LiveActivityPort {
  authorization(): NativeLaAuthorization;
  /** The kinds this build's widget extension draws; `null` in a build that does not say. */
  drawnKinds(): readonly NativeLaKind[] | null;
  start(request: NativeLaStartRequest): Promise<string>;
  update(request: NativeLaUpdateRequest): Promise<void>;
  end(request: NativeLaEndRequest): Promise<void>;
  list(): (NativeLaActivity & { readonly state: NativeLaState | 'pending' })[];
  onPushToStartToken(
    listener: (event: { readonly kind: NativeLaKind; readonly token: string }) => void,
  ): EventSubscription;
  onUpdateToken(
    listener: (event: NativeLaActivity & { readonly token: string }) => void,
  ): EventSubscription;
  onActivityState(
    listener: (event: NativeLaActivity & { readonly state: NativeLaState }) => void,
  ): EventSubscription;
}

let port: LiveActivityPort | null = null;

/** The one port over the installed module (the same object every call), or `null` without it. */
export function getLiveActivityPort(): LiveActivityPort | null {
  const native = nativeCpLiveActivityModule;
  if (native === null) return null;
  port ??= {
    authorization: () => native.authorization(),
    drawnKinds: () => (typeof native.drawnKinds === 'function' ? native.drawnKinds() : null),
    start: (request) => native.start(request),
    update: (request) => native.update(request),
    end: (request) => native.end(request),
    list: () => native.list(),
    onPushToStartToken: (listener) => native.addListener('onPushToStartToken', listener),
    onUpdateToken: (listener) => native.addListener('onUpdateToken', listener),
    onActivityState: (listener) => native.addListener('onActivityState', listener),
  };
  return port;
}
