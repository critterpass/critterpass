import { NativeModule, requireOptionalNativeModule } from 'expo';

/** What the native picker hands back (Swift `PickedContact` / Kotlin `PickedContact`). */
export interface NativePickedContact {
  readonly name: string;
  readonly phone?: string;
}

/**
 * The native binding (Swift `CpContactPickerModule` / Kotlin `CpContactPickerModule`).
 * `requireOptionalNativeModule` resolves to `null` in a build without it (Jest, or a binary built
 * before the module existed); the composer then hides "pick a contact".
 */
export declare class NativeCpContactPickerModule extends NativeModule {
  /** `null` when the user cancels. */
  pick(): Promise<NativePickedContact | null>;
}

export const nativeCpContactPickerModule =
  requireOptionalNativeModule<NativeCpContactPickerModule>('CpContactPicker');
