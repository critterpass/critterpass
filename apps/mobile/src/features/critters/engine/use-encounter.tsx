/**
 * The encounter engine in the session: `EncounterRuntime` keeps its spawn candidates and constants
 * fresh from local rows, hands it the command queue, and feeds it the location engine's fixes only
 * while there is something to meet (it never asks for permission and never starts a location
 * session itself). While an encounter runs it ticks each second (the drain) and mirrors a nearby
 * snapshot (distance band and silhouette stage, no position) to the App Group for the Live
 * Activity and widgets. `useEncounter` is the screens' view of it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and file keys, never copy. */
import { resolveEncounterConfig, type WindowRule } from '@cp/domain';
import { router } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { getLocationEngine, useExploreAtHome } from '@/lib/location';
import { toast } from '@/motion';

import { useInFront } from '../data/app-front';
import {
  befriendCritterCommand,
  endEncounterCommand,
  reportEncounterSamplesCommand,
  startEncounterCommand,
} from '../data/commands';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import {
  ENTRIES_SQL,
  ENTRIES_TABLES,
  ME_SQL,
  ME_TABLES,
  SETS_SQL,
  SETS_TABLES,
  TRIPS_SQL,
  TRIPS_TABLES,
  WINDOWS_SQL,
  WINDOWS_TABLES,
  type EntryRow,
  type MeRow,
  type SetRow,
  type TripRow,
  type WindowRow,
} from '../data/queries';
import {
  SPAWN_POIS_SQL,
  SPAWN_POIS_TABLES,
  SPAWNS_SQL,
  SPAWNS_TABLES,
  type SpawnPoiRow,
  type SpawnSqlRow,
} from '../data/spawn-rows';
import { windowRule } from '../dex/dex-model';
import { look, rustled } from '../encounter/encounter-copy';
import { deviceTimeZone } from '../hatch/hatch-model';
import { encounterRoute } from '../routes';
import type { EngineSnapshot } from './engine';
import { writeNearby } from './nearby-snapshot';
import { encounterEngine, setEncounterInputs } from './session';
import { spawnCandidates } from './spawn-feed';

const CONFIG_SQL = `SELECT value FROM client_config WHERE key = 'encounter'`;
const LIVE = new Set(['accruing', 'ready', 'draining']);
/** How often the runtime looks for the location engine once there is something to meet. */
const ENGINE_POLL_MS = 10_000;

function parseConfig(value: string | null): unknown {
  try {
    return JSON.parse(value ?? 'null') as unknown;
  } catch {
    return null;
  }
}

function useEncounterInputs() {
  const uid = useOwnerUid();
  const mine = uid === null ? null : [uid];
  const spawns = useLiveRows<SpawnSqlRow>(SPAWNS_SQL, [], SPAWNS_TABLES).rows;
  const pois = useLiveRows<SpawnPoiRow>(SPAWN_POIS_SQL, [], SPAWN_POIS_TABLES).rows;
  const windows = useLiveRows<WindowRow>(WINDOWS_SQL, [], WINDOWS_TABLES).rows;
  const sets = useLiveRows<SetRow>(SETS_SQL, [], SETS_TABLES).rows;
  const entries = useLiveRows<EntryRow>(ENTRIES_SQL, mine, ENTRIES_TABLES).rows;
  const trips = useLiveRows<TripRow>(TRIPS_SQL, mine, TRIPS_TABLES).rows;
  const me = useLiveRows<MeRow>(ME_SQL, mine, ME_TABLES).rows[0] ?? null;
  const configRow = useLiveRows<{ value: string | null }>(CONFIG_SQL, [], ['client_config']).rows;
  return { spawns, pois, windows, sets, entries, trips, me, configRow };
}

export function EncounterRuntime() {
  const { commands, network } = useLocalFirst();
  const rows = useEncounterInputs();
  const exploreAtHome = useExploreAtHome();
  const foreground = useInFront();
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));

  const candidates = useMemo(() => {
    const trip = rows.trips.find((t) => t.status === 'in_trip') ?? null;
    const windows = new Map<string, WindowRule>();
    for (const w of rows.windows) {
      const rule = windowRule(w);
      if (rule !== null) windows.set(w.id, rule);
    }
    const owned = rows.entries.filter((e) => e.verification !== 'revoked');
    const formSet = new Map(rows.spawns.map((r) => [r.form_id, r.set_id]));
    const ownedInSet = new Map<string, number>();
    for (const e of owned) {
      const set = formSet.get(e.form_id);
      if (set !== undefined) ownedInSet.set(set, (ownedInSet.get(set) ?? 0) + 1);
    }
    return spawnCandidates({
      rules: rows.spawns,
      pois: new Map(rows.pois.map((p) => [p.id, p])),
      windows,
      setCountry: new Map(rows.sets.map((s) => [s.id, s.country.toUpperCase()])),
      ownedForms: new Set(owned.map((e) => e.form_id)),
      ownedInSet,
      trip: trip === null ? null : { id: trip.id, destinationId: trip.destination_id },
      homeCountry: rows.me?.home_country ?? null,
      exploreAtHome,
      foreground,
      now: new Date(minute * 60_000),
      tz: trip?.tz ?? deviceTimeZone(),
    });
  }, [
    rows.spawns,
    rows.pois,
    rows.windows,
    rows.sets,
    rows.entries,
    rows.trips,
    rows.me,
    exploreAtHome,
    foreground,
    minute,
  ]);

  const configValue = rows.configRow[0]?.value ?? null;
  useEffect(() => {
    setEncounterInputs({
      candidates,
      config: resolveEncounterConfig(parseConfig(configValue)),
      online: () => network.isOnline(),
      commands: {
        start: (p) => void commands.send(startEncounterCommand, p),
        report: (p) => void commands.send(reportEncounterSamplesCommand, p),
        end: (p) => void commands.send(endEncounterCommand, p),
        befriend: (p) => void commands.send(befriendCritterCommand, p),
      },
    });
  }, [candidates, configValue, commands, network]);

  // Windows and solar gates move with the clock.
  useEffect(() => {
    const timer = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(timer);
  }, []);

  const wanted = candidates.length > 0;
  const [poll, setPoll] = useState(0);
  useEffect(() => {
    if (!wanted) return undefined;
    const location = getLocationEngine();
    if (location === null) {
      const timer = setTimeout(() => setPoll((n) => n + 1), ENGINE_POLL_MS);
      return () => clearTimeout(timer);
    }
    const engine = encounterEngine();
    return location.subscribe('encounter', { onFix: (fix) => engine.onFix(fix) });
  }, [wanted, poll]);

  const snapshot = useEncounter().snapshot;
  const live = LIVE.has(snapshot.phase);
  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(() => encounterEngine().tick(), 1000);
    return () => clearInterval(timer);
  }, [live]);
  useEffect(() => writeNearby(snapshot), [snapshot]);

  // A new encounter while the app is in front: say so, with a way in.
  const startedId = snapshot.phase === 'accruing' ? snapshot.encounterId : null;
  const place = snapshot.candidate?.spot.name ?? '';
  useEffect(() => {
    if (startedId === null || !foreground) return;
    toast.show({
      id: `critters-rustled-${startedId}`,
      title: rustled(place),
      action: { label: look(), onPress: () => router.push(encounterRoute(startedId)) },
    });
  }, [startedId, foreground, place]);
  return null;
}

export interface EncounterView {
  readonly snapshot: EngineSnapshot;
  readonly befriend: (via: 'hold' | 'accessible') => Promise<boolean>;
  readonly abandon: () => void;
  readonly dismiss: () => void;
}

export function useEncounter(): EncounterView {
  const engine = encounterEngine();
  const snapshot = useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.snapshot(),
  );
  return {
    snapshot,
    befriend: (via) => engine.befriend(via),
    abandon: () => engine.abandon(),
    dismiss: () => engine.dismiss(),
  };
}
