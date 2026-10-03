/**
 * The person's price display on this phone, shared by every screen that shows a price: one live
 * read of their settings, home country and the newest fx run, however many prices are on screen.
 * A change made in Settings shows at once (before its row syncs back). Outside a signed-in
 * session, prices show in their own currency.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import type { FxSnapshot } from '@cp/cost-engine';
import type { PriceDisplayMode } from '@cp/domain';
import { useCallback, useContext, useSyncExternalStore } from 'react';

import { LocalFirstContext } from '../powersync/local-first-context';
import { DEFAULT_MONEY_DISPLAY, moneyDisplayOf, type MoneyDisplay } from './money-display';
import { setCurrentMoneyDisplay } from './current-money-display';

/**
 * The `local_state` key the signed-in uid is kept under (`OWNER_UID_KEY` in
 * ../powersync/local-tables), written out so prices can be drawn without loading the database
 * module; a test keeps the two equal.
 */
export const OWNER_UID_STATE_KEY = 'owner_uid';

const ME_SQL = `SELECT s.price_display, s.home_currency_override, u.home_country
  FROM users u LEFT JOIN user_settings s ON s.user_id = u.id
  WHERE u.id = (SELECT value FROM local_state WHERE id = ?)`;
/** The newest rate of every pair on the phone (fx runs are synced per pair, not all at once). */
const FX_SQL = `SELECT f.base, f.quote, f.rate, f.as_of, f.source FROM fx_snapshots f
  WHERE f.as_of = (SELECT max(o.as_of) FROM fx_snapshots o WHERE o.base = f.base AND o.quote = f.quote)
  ORDER BY f.as_of DESC, f.base, f.quote`;
const TABLES = ['users', 'user_settings', 'fx_snapshots', 'local_state'];

interface MeRow {
  readonly price_display: string | null;
  readonly home_currency_override: string | null;
  readonly home_country: string | null;
}

interface FxRow {
  readonly base: string;
  readonly quote: string;
  readonly rate: string | number;
  readonly as_of: string;
  readonly source: string;
}

export interface MoneyDisplayOverride {
  readonly mode?: PriceDisplayMode;
  /** `null` goes back to the home airport's currency. */
  readonly homeCurrency?: string | null;
}

/** A stored rate as an exact decimal string (a REAL column may read back as 6.25e-5). */
export function rateText(rate: string | number): string {
  const text = String(rate);
  return /e/iu.test(text) ? Number(text).toFixed(12).replace(/0+$/u, '').replace(/\.$/u, '') : text;
}

interface Store {
  rows: { me: MeRow | null; fx: readonly FxSnapshot[] };
  override: MoneyDisplayOverride;
  value: MoneyDisplay;
  listeners: Set<() => void>;
  stop: (() => void) | null;
}

const stores = new WeakMap<AbstractPowerSyncDatabase, Store>();
let pendingOverride: MoneyDisplayOverride = {};
const openStores = new Set<Store>();

function compute(store: Store): MoneyDisplay {
  const me = store.rows.me;
  const override = store.override;
  return moneyDisplayOf({
    priceDisplay: override.mode ?? me?.price_display ?? null,
    homeCurrencyOverride:
      override.homeCurrency !== undefined
        ? override.homeCurrency
        : (me?.home_currency_override ?? null),
    homeCountry: me?.home_country ?? null,
    fx: store.rows.fx,
  });
}

function notify(store: Store): void {
  store.value = compute(store);
  setCurrentMoneyDisplay(store.value);
  for (const listener of store.listeners) listener();
}

function storeFor(db: AbstractPowerSyncDatabase): Store {
  let store = stores.get(db);
  if (store === undefined) {
    store = {
      rows: { me: null, fx: [] },
      override: pendingOverride,
      value: DEFAULT_MONEY_DISPLAY,
      listeners: new Set(),
      stop: null,
    };
    store.value = compute(store);
    stores.set(db, store);
  }
  return store;
}

/** Once the synced row says what the override said, the row takes over again. */
function settle(store: Store): void {
  const me = store.rows.me;
  const next: { mode?: PriceDisplayMode; homeCurrency?: string | null } = { ...store.override };
  if (next.mode !== undefined && me?.price_display === next.mode) delete next.mode;
  if (
    next.homeCurrency !== undefined &&
    (me?.home_currency_override ?? null) === next.homeCurrency
  ) {
    delete next.homeCurrency;
  }
  store.override = next;
  pendingOverride = next;
}

function start(db: AbstractPowerSyncDatabase, store: Store): void {
  const controller = new AbortController();
  const load = () =>
    Promise.all([
      db.getAll<MeRow>(ME_SQL, [OWNER_UID_STATE_KEY]),
      db.getAll<FxRow>(FX_SQL).catch(() => [] as FxRow[]),
    ]).then(
      ([me, fx]) => {
        if (controller.signal.aborted) return;
        store.rows = {
          me: me[0] ?? null,
          fx: fx.map((row) => ({
            base: row.base,
            quote: row.quote,
            rate: rateText(row.rate),
            asOf: row.as_of.slice(0, 10),
            source: row.source,
          })),
        };
        settle(store);
        notify(store);
      },
      () => undefined,
    );
  void load();
  db.onChange(
    { onChange: () => load() },
    { tables: TABLES, throttleMs: 50, signal: controller.signal },
  );
  store.stop = () => controller.abort();
}

function subscribe(db: AbstractPowerSyncDatabase, store: Store, listener: () => void) {
  store.listeners.add(listener);
  if (store.stop === null) start(db, store);
  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0) {
      store.stop?.();
      store.stop = null;
    }
  };
}

/**
 * Shows a Settings change everywhere at once, while its command waits to sync. The synced row
 * replaces it as soon as it says the same.
 */
export function applyMoneyDisplay(change: MoneyDisplayOverride): void {
  pendingOverride = { ...pendingOverride, ...change };
  // Every open store (one per signed-in database) picks the change up.
  for (const store of openStores) {
    store.override = { ...store.override, ...change };
    notify(store);
  }
}

/** Test-only: forgets every unsynced change. */
export function clearMoneyDisplayOverride(): void {
  pendingOverride = {};
  for (const store of openStores) {
    store.override = {};
    notify(store);
  }
}

export function useMoneyDisplay(): MoneyDisplay {
  const db = useContext(LocalFirstContext)?.db ?? null;
  const store = db === null ? null : storeFor(db);
  return useSyncExternalStore(
    useCallback(
      (listener: () => void) => {
        if (db === null || store === null) return () => undefined;
        openStores.add(store);
        const stop = subscribe(db, store, listener);
        return () => {
          stop();
          if (store.listeners.size === 0) openStores.delete(store);
        };
      },
      [db, store],
    ),
    () => store?.value ?? DEFAULT_MONEY_DISPLAY,
  );
}
