import { NativeModule, requireOptionalNativeModule } from 'expo';

/** A kind the phone can show (packages/domain `LaKind`, less AlarmKit's own alarm). */
export type NativeLaKind =
  'leave_by' | 'meet_up' | 'flight' | 'vote' | 'critter_nearby' | 'storm' | 'sos' | 'ride';

/** What the server hears about an activity (`report_la_state`). */
export type NativeLaState = 'active' | 'stale' | 'ended' | 'dismissed';

export interface NativeLaActivity {
  /** ActivityKit's id for the activity on this phone. */
  readonly id: string;
  readonly kind: NativeLaKind;
  /** The static attributes, in the domain's wire shape. */
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface NativeLaAuthorization {
  /** Live Activities are allowed for the app (Settings › CritterPass). */
  readonly enabled: boolean;
  /** "More Frequent Updates" is on. */
  readonly frequent: boolean;
}

export interface NativeLaStartRequest {
  readonly kind: NativeLaKind;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly state: Readonly<Record<string, unknown>>;
  /** Unix seconds. */
  readonly staleDate?: number;
  readonly relevance?: number;
  /** Subscribe to the object's broadcast channel instead of a per-activity token. */
  readonly channelId?: string;
}

export interface NativeLaUpdateRequest {
  readonly kind: NativeLaKind;
  readonly id: string;
  readonly state: Readonly<Record<string, unknown>>;
  readonly staleDate?: number;
  readonly relevance?: number;
}

export interface NativeLaEndRequest {
  readonly kind: NativeLaKind;
  readonly id: string;
  /** The final frame; the last one shown stays when omitted. */
  readonly state?: Readonly<Record<string, unknown>>;
  /** Unix seconds; the system default when omitted. */
  readonly dismissAt?: number;
}

export declare class NativeCpLiveActivityModule extends NativeModule<{
  onPushToStartToken: (event: { readonly kind: NativeLaKind; readonly token: string }) => void;
  onUpdateToken: (event: NativeLaActivity & { readonly token: string }) => void;
  onActivityState: (event: NativeLaActivity & { readonly state: NativeLaState }) => void;
}> {
  authorization(): NativeLaAuthorization;
  /** The kinds this build's widget extension draws; absent in builds before it was reported. */
  drawnKinds?(): NativeLaKind[];
  /** Resolves with the new activity's id. */
  start(request: NativeLaStartRequest): Promise<string>;
  update(request: NativeLaUpdateRequest): Promise<void>;
  end(request: NativeLaEndRequest): Promise<void>;
  list(): (NativeLaActivity & { readonly state: NativeLaState | 'pending' })[];
}

export const nativeCpLiveActivityModule =
  requireOptionalNativeModule<NativeCpLiveActivityModule>('CpLiveActivity');
