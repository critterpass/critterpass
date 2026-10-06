/**
 * The app icon picker's rules (3n-5), pure: which icons this build offers (only the ones it
 * bundles and has a preview for), which one is showing, which earned ones are still locked, and
 * what choosing one does. The device is the truth for what is showing; the account keeps a copy
 * (`set_app_icon`) so a reinstall can restore it, and the copy is sent again whenever it differs.
 */
/* eslint-disable lingui/no-unlocalized-strings -- states and ids, never copy. */
import {
  APP_ICON_CATALOGUE,
  appIconDenial,
  appIconKey,
  parseAppIconKey,
  type AppIconBaseId,
  type AppIconGate,
  type SetAppIconPayload,
} from '@cp/domain';

import { iconKeyFromNativeName, nativeIconName } from '@/lib/app-icon';

export type IconChoiceState = 'in_use' | 'available' | 'locked';

export interface IconChoice {
  readonly id: AppIconBaseId;
  readonly gate: AppIconGate;
  readonly state: IconChoiceState;
  /** An earned icon unlocked since the picker was last used. */
  readonly isNew: boolean;
}

export interface IconUnlock {
  readonly iconKey: string;
  readonly seen: boolean;
}

export interface PickerInput {
  /** Catalogue keys the build bundles (`bundledAppIconKeys`). */
  readonly bundled: ReadonlySet<string>;
  /** Ids the app has a preview picture for. */
  readonly previewed: ReadonlySet<string>;
  /** The native name of the icon showing now (`null` = the primary icon). */
  readonly currentNativeName: string | null;
  readonly unlocks: readonly IconUnlock[];
  readonly passPlus: boolean;
}

export interface PickerModel {
  readonly current: AppIconBaseId | null;
  readonly styles: readonly IconChoice[];
  readonly earned: readonly IconChoice[];
  readonly earnedUnlocked: number;
}

/** The base icon a native name shows, whatever its appearance. */
export function iconIdFromNativeName(name: string | null): AppIconBaseId | null {
  const key = iconKeyFromNativeName(name);
  return key === null ? null : (parseAppIconKey(key)?.id ?? null);
}

export function pickerModel(input: PickerInput): PickerModel {
  const current = iconIdFromNativeName(input.currentNativeName);
  const access = {
    passPlus: input.passPlus,
    unlocked: new Set(input.unlocks.map((unlock) => unlock.iconKey)),
  };
  const fresh = new Set(input.unlocks.filter((u) => !u.seen).map((u) => u.iconKey));
  const choices: IconChoice[] = APP_ICON_CATALOGUE.filter(
    (entry) => input.bundled.has(appIconKey(entry.id, 'auto')) && input.previewed.has(entry.id),
  ).map((entry) => {
    const locked = appIconDenial(entry.id, access) !== null;
    return {
      id: entry.id,
      gate: entry.gate,
      state: entry.id === current ? 'in_use' : locked ? 'locked' : 'available',
      isNew: !locked && entry.id !== current && fresh.has(entry.id),
    };
  });
  const earned = choices.filter((choice) => choice.gate === 'earned');
  return {
    current,
    styles: choices.filter((choice) => choice.gate !== 'earned'),
    earned,
    earnedUnlocked: earned.filter((choice) => choice.state !== 'locked').length,
  };
}

export interface ChooseIconPorts {
  /** Switches the home-screen icon; rejects when the device cannot. */
  readonly setNative: (name: string | null) => Promise<void>;
  /** Records the choice on the account; a failure is retried the next time the picker opens. */
  readonly record: (payload: SetAppIconPayload) => Promise<unknown>;
}

export type ChooseIconResult = 'changed' | 'unchanged' | 'locked' | 'failed';

/** Choosing an icon: locked ones never reach the device, and the account is told only after it switched. */
export async function chooseIcon(
  choice: IconChoice,
  ports: ChooseIconPorts,
): Promise<ChooseIconResult> {
  if (choice.state === 'locked') return 'locked';
  if (choice.state === 'in_use') return 'unchanged';
  try {
    await ports.setNative(nativeIconName(choice.id, 'auto'));
  } catch {
    return 'failed';
  }
  await ports.record({ icon_id: choice.id, appearance: 'auto' }).catch(() => undefined);
  return 'changed';
}

/**
 * The account's copy to send when it disagrees with the device (a switch made offline, or a
 * reinstall that came up on the primary icon); `null` when they agree or the device shows an
 * icon this build does not know.
 */
export function iconToRecord(
  currentNativeName: string | null,
  savedKey: string | null,
): SetAppIconPayload | null {
  const key = iconKeyFromNativeName(currentNativeName);
  const parsed = key === null ? null : parseAppIconKey(key);
  if (key === null || parsed === null) return null;
  // An account that never chose has no copy; the primary icon needs none.
  if (savedKey === null && currentNativeName === null) return null;
  return savedKey === key ? null : { icon_id: parsed.id, appearance: parsed.appearance };
}
