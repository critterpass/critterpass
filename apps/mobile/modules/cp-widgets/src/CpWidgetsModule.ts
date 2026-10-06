import { NativeModule, requireOptionalNativeModule } from 'expo';

/** A widget placed on this phone, as WidgetKit reports it (its kind string and family). */
export interface NativeInstalledWidget {
  readonly kind: string;
  readonly family: string;
}

export declare class NativeCpWidgetsModule extends NativeModule {
  reloadAll(): void;
  reload(kind: string): void;
  installed(): Promise<NativeInstalledWidget[]>;
  /** Missing on binaries built before widget push. */
  pushToken?: () => string | null;
}

export const nativeCpWidgetsModule =
  requireOptionalNativeModule<NativeCpWidgetsModule>('CpWidgets');
