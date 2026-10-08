/**
 * The app icon picker over this device and account: what the home screen shows comes from the
 * device, which earned icons are open from the synced unlocks. Choosing switches the device and
 * then tells the account; when the two disagree on opening (a switch made offline, a reinstall)
 * the account's copy is sent again. A Pass+ style without Pass+ opens the paywall, and one left
 * showing after Pass+ ended goes back to the default.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and command names, never copy. */
import type { AppIconBaseId } from '@cp/domain';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { goBackOr } from '@/lib/navigation/back';
import { useCommand } from '@/data/commands/use-command';
import { bundledAppIconKeys, nativeIconName } from '@/lib/app-icon';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { YOU_ROUTES } from '../routes';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { setAppIconCommand } from './app-icon-command';
import { APP_ICON_PREVIEWS } from './app-icon-previews';
import { AppIconView, type AppIconProblem } from './app-icon-view';
import { deviceAppIcon, type AppIconDevice } from './device';
import { AppIconLapseRevert, ICON_STYLES_SQL, ICON_STYLES_TABLES } from './lapse-revert';
import {
  chooseIcon,
  iconStylesOpen,
  iconToRecord,
  lockedIconAction,
  pickerModel,
  type IconChoice,
  type IconStylesRow,
} from './picker-model';

export { setAppIconCommand };

const UNLOCKS_SQL = 'SELECT icon_key, seen_at FROM app_icon_unlocks WHERE user_id = ?';
const UNLOCKS_TABLES = ['app_icon_unlocks'];
const SAVED_SQL = 'SELECT app_icon FROM users WHERE id = ?';
const SAVED_TABLES = ['users'];
const PREVIEWED = new Set(Object.keys(APP_ICON_PREVIEWS));

export function AppIconScreen({ device = deviceAppIcon }: { readonly device?: AppIconDevice }) {
  const uid = useOwnerUid();
  const params = uid === null ? null : [uid];
  const unlocks = useLiveRows<{ icon_key: string; seen_at: string | null }>(
    UNLOCKS_SQL,
    params,
    UNLOCKS_TABLES,
  ).rows;
  const saved = useLiveRows<{ app_icon: string | null }>(SAVED_SQL, params, SAVED_TABLES);
  const styles = useLiveRows<IconStylesRow>(ICON_STYLES_SQL, params, ICON_STYLES_TABLES).rows;
  const record = useCommand(setAppIconCommand);
  // `undefined` until the device has answered.
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [switching, setSwitching] = useState<AppIconBaseId | null>(null);
  const [problem, setProblem] = useState<AppIconProblem>(null);
  const bundled = useMemo(() => bundledAppIconKeys(device.bundledNames()), [device]);

  useEffect(() => {
    let live = true;
    void device.getCurrent().then(
      (name) => live && setCurrent(name),
      () => live && setCurrent(null),
    );
    return () => {
      live = false;
    };
  }, [device]);

  const reconciled = useRef(false);
  const savedRow = saved.rows[0];
  useEffect(() => {
    if (reconciled.current || current === undefined || savedRow === undefined) return;
    reconciled.current = true;
    const payload = iconToRecord(current, savedRow.app_icon);
    if (payload !== null) void record.send(payload).catch(() => undefined);
  }, [current, savedRow, record]);

  const model = pickerModel({
    bundled,
    previewed: PREVIEWED,
    currentNativeName: current ?? null,
    unlocks: unlocks.map((row) => ({ iconKey: row.icon_key, seen: row.seen_at !== null })),
    passPlus: iconStylesOpen(styles[0]),
  });

  const choose = async (choice: IconChoice) => {
    setProblem(null);
    if (choice.state === 'locked') {
      if (lockedIconAction(choice) === 'paywall') {
        // An explicit ask, like the plan page's own link: it never counts as an unasked paywall.
        const paywall = hrefFor('4e-1', { entry: 'plan_page' });
        if (paywall !== undefined) router.push(paywall);
        return;
      }
      setProblem({ locked: choice.id });
      return;
    }
    setSwitching(choice.id);
    const result = await chooseIcon(choice, {
      setNative: device.set,
      record: (payload) => record.send(payload),
    });
    setSwitching(null);
    if (result === 'changed') {
      reconciled.current = true;
      setCurrent(nativeIconName(choice.id, 'auto'));
    }
    if (result === 'failed') setProblem('failed');
  };

  return (
    <>
      <AppIconLapseRevert device={device} />
      <AppIconView
        model={model}
        switching={switching}
        problem={problem}
        onChoose={(choice) => void choose(choice)}
        onBack={() => goBackOr(YOU_ROUTES.settings)}
      />
    </>
  );
}
