/**
 * The device's permission picture for the UI: the latest report per kind (from cp-permissions,
 * refreshed on every foreground) plus, persisted in MMKV, when each trigger's primer was last
 * declined — the input to the re-ask window. Plain external store read with
 * `useSyncExternalStore`; it holds no synced rows.
 */
import type {
  LocationLevel,
  PermissionKind,
  PermissionStatus,
  PermissionTrigger,
} from '@cp/domain';
import { createMMKV } from 'react-native-mmkv';

/** One kind as the OS reports it (structurally cp-permissions' `KindReport`). */
export interface PermissionReport {
  readonly kind: PermissionKind;
  readonly status: PermissionStatus;
  readonly canAskAgain: boolean;
  readonly available: boolean;
  readonly level?: LocationLevel;
  readonly precise?: boolean;
  readonly timeSensitive?: boolean;
}

export interface PermissionsSnapshot {
  readonly reports: Readonly<Record<PermissionKind, PermissionReport>>;
  readonly alarms: { readonly exactAlarm: boolean; readonly fullScreenIntent: boolean } | null;
  readonly liveActivities: { readonly enabled: boolean; readonly frequent: boolean } | null;
}

export interface PermissionsState {
  readonly reports: Readonly<Partial<Record<PermissionKind, PermissionReport>>>;
  readonly alarms: PermissionsSnapshot['alarms'];
  readonly liveActivities: PermissionsSnapshot['liveActivities'];
}

export interface KeyValueStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean | void;
}

export interface PermissionStore {
  getState(): PermissionsState;
  subscribe(listener: () => void): () => void;
  setSnapshot(snapshot: PermissionsSnapshot): void;
  setReport(report: PermissionReport): void;
  lastDeclinedAt(trigger: PermissionTrigger): number | null;
  markDeclined(trigger: PermissionTrigger, at: number): void;
  clearDeclined(trigger: PermissionTrigger): void;
}

const EMPTY: PermissionsState = { reports: {}, alarms: null, liveActivities: null };
const declinedKey = (trigger: PermissionTrigger) => `declined:${trigger}`;

export function createPermissionStore(storage: KeyValueStorage): PermissionStore {
  let state = EMPTY;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSnapshot(snapshot) {
      state = {
        reports: snapshot.reports,
        alarms: snapshot.alarms,
        liveActivities: snapshot.liveActivities,
      };
      emit();
    },
    setReport(report) {
      state = { ...state, reports: { ...state.reports, [report.kind]: report } };
      emit();
    },
    lastDeclinedAt(trigger) {
      const raw = storage.getString(declinedKey(trigger));
      const value = raw === undefined ? Number.NaN : Number(raw);
      return Number.isFinite(value) ? value : null;
    },
    markDeclined(trigger, at) {
      storage.set(declinedKey(trigger), String(at));
    },
    clearDeclined(trigger) {
      storage.remove(declinedKey(trigger));
    },
  };
}

let shared: PermissionStore | null = null;

/** The app-wide store over its own MMKV instance. */
export function getPermissionStore(): PermissionStore {
  shared ??= createPermissionStore(createMMKV({ id: 'cp-permissions' }));
  return shared;
}
