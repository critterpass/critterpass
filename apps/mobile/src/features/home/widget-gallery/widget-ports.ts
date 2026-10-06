/**
 * What the widget sync needs from the device: the App Group writer (modules/cp-app-group) and
 * WidgetKit (modules/cp-widgets), looked up by name so a binary without them (older builds,
 * Android, web) simply has no port.
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

export interface WidgetPorts {
  readonly sink: WidgetSnapshotSink;
  /** Null in a build without the WidgetKit module. */
  readonly installed: (() => Promise<readonly PlacedWidget[]>) | null;
  /** The widget extension's push token; null in a build without widget push. */
  readonly pushToken: (() => string | null) | null;
}

let ports: WidgetPorts | null | undefined;

export function installedWidgetPorts(): WidgetPorts | null {
  if (ports !== undefined) return ports;
  const appGroup = requireOptionalNativeModule<NativeAppGroup>('CpAppGroup');
  const widgets = requireOptionalNativeModule<NativeWidgets>('CpWidgets');
  ports =
    appGroup === null
      ? null
      : {
          sink: {
            writeSnapshot: (key, json) => appGroup.writeSnapshot(key, json),
            reloadWidgets: () => appGroup.reloadWidgets(),
          },
          installed: widgets === null ? null : () => widgets.installed(),
          pushToken: widgets?.pushToken === undefined ? null : () => widgets.pushToken?.() ?? null,
        };
  return ports;
}
