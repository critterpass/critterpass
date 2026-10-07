/**
 * What the widget sync needs from the device: the App Group writer (modules/cp-app-group) and
 * the placed widgets (WidgetKit through modules/cp-widgets, Glance through
 * modules/cp-android-surfaces), looked up by name so a binary without them (older builds, web)
 * simply has no port.
 */

import { requireOptionalNativeModule } from 'expo';

import type { PlacedWidget } from './installed-widgets';
import type { WidgetSnapshotSink } from './write-widget-snapshot';

interface NativeAppGroup {
  writeSnapshot(key: string, json: string): void;
  reloadWidgets(): void;
}

interface NativeWidgets {
  installed(): Promise<PlacedWidget[]>;
  /** Missing on binaries built before widget push. */
  pushToken?: () => string | null;
}

/** The Android surfaces module's widget calls. */
interface NativeAndroidWidgets {
  installedWidgets(): PlacedWidget[];
  requestPinWidget(kind: string): boolean;
}

function androidWidgets(): NativeAndroidWidgets | null {
  return requireOptionalNativeModule<NativeAndroidWidgets>('CpAndroidSurfaces');
}

/**
 * Asks the launcher to pin a widget (Android); false when it cannot. Null where an app cannot
 * add a widget at all (iOS) or the module is missing.
 */
export function widgetPinPort(): ((kind: string) => boolean) | null {
  const android = androidWidgets();
  return android === null ? null : (kind) => android.requestPinWidget(kind);
}

export interface WidgetPorts {
  readonly sink: WidgetSnapshotSink;
  /** Null in a build with neither widget module. */
  readonly installed: (() => Promise<readonly PlacedWidget[]>) | null;
  /** The widget extension's push token; null in a build without widget push. */
  readonly pushToken: (() => string | null) | null;
}

let ports: WidgetPorts | null | undefined;

export function installedWidgetPorts(): WidgetPorts | null {
  if (ports !== undefined) return ports;
  const appGroup = requireOptionalNativeModule<NativeAppGroup>('CpAppGroup');
  const widgets = requireOptionalNativeModule<NativeWidgets>('CpWidgets');
  const android = androidWidgets();
  ports =
    appGroup === null
      ? null
      : {
          sink: {
            writeSnapshot: (key, json) => appGroup.writeSnapshot(key, json),
            reloadWidgets: () => appGroup.reloadWidgets(),
          },
          installed:
            widgets !== null
              ? () => widgets.installed()
              : android !== null
                ? () => Promise.resolve(android.installedWidgets())
                : null,
          pushToken: widgets?.pushToken === undefined ? null : () => widgets.pushToken?.() ?? null,
        };
  return ports;
}
