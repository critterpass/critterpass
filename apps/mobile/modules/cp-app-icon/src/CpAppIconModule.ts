import { NativeModule, requireOptionalNativeModule } from 'expo';

/**
 * The native binding: iOS `setAlternateIconName`, Android launcher `activity-alias` switching.
 * Resolves to `null` where the module is not linked (Jest, web), which the JS API reads as
 * "this device cannot change its icon".
 */
export declare class NativeCpAppIconModule extends NativeModule {
  isSupported(): Promise<boolean>;
  /** The native name of the icon showing, `null` for the primary icon. */
  getCurrent(): Promise<string | null>;
  /** Every alternate icon name the app ships (the primary icon is not listed). */
  bundledNames(): string[];
  set(name: string | null): Promise<string | null>;
}

export const nativeCpAppIconModule =
  requireOptionalNativeModule<NativeCpAppIconModule>('CpAppIcon');
