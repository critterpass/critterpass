/**
 * The app icon picker over this device and account: what the home screen shows comes from the
 * device, which earned icons are open from the synced unlocks. Choosing switches the device and
 * then tells the account; when the two disagree on opening (a switch made offline, a reinstall)
 * the account's copy is sent again.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and command names, never copy. */
import type { AppIconBaseId, SetAppIconPayload } from '@cp/domain';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { bundledAppIconKeys, nativeIconName } from '@/lib/app-icon';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { APP_ICON_PREVIEWS } from './app-icon-previews';
import { AppIconView, type AppIconProblem } from './app-icon-view';
import { deviceAppIcon, type AppIconDevice } from './device';
import { chooseIcon, iconToRecord, pickerModel, type IconChoice } from './picker-model';

export const setAppIconCommand = defineClientCommand<SetAppIconPayload>({
  name: 'set_app_icon',
  offline: false,
});

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
    // No Pass+ style is bundled, so none is offered and none needs the entitlement here.
    passPlus: false,
  });

  const choose = async (choice: IconChoice) => {
    setProblem(null);
    if (choice.state === 'locked') {
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
    <AppIconView
      model={model}
      switching={switching}
      problem={problem}
      onChoose={(choice) => void choose(choice)}
      onBack={() => router.back()}
    />
  );
}
