/**
 * Widgets on the device (iOS WidgetKit; Android's Glance widgets are drawn by their own module).
 * Every call is safe in a binary built without this module: the port is then `null`.
 */
import { nativeCpWidgetsModule, type NativeInstalledWidget } from './src/CpWidgetsModule';

export type { NativeInstalledWidget as InstalledWidget };

export interface WidgetsPort {
  /** Every widget redraws from the App Group's latest snapshot. */
  reloadAll(): void;
  /** The widgets placed on this phone: WidgetKit kind and family. */
  installed(): Promise<NativeInstalledWidget[]>;
  /** The widget extension's push token (hex) for `register_widget_token`, null until issued. */
  pushToken(): string | null;
}

let port: WidgetsPort | null = null;

/** The one port over the installed module, or `null` without it. */
export function getWidgetsPort(): WidgetsPort | null {
  const native = nativeCpWidgetsModule;
  if (native === null) return null;
  port ??= {
    reloadAll: () => native.reloadAll(),
    installed: () => native.installed(),
    pushToken: () => native.pushToken?.() ?? null,
  };
  return port;
}
