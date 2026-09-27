import { NativeModule, requireNativeModule } from 'expo';

declare class CpAppGroupModule extends NativeModule {
  writeSnapshot(key: string, json: string): void;
  writeImage(key: string, pngBase64: string): void;
  writeEndpointsConfig(json: string): void;
  readOutbox(): string;
  removeOutboxActions(opIds: string[]): number;
  clearOutbox(): void;
  reloadWidgets(): void;
}

export const cpAppGroupNativeModule = requireNativeModule<CpAppGroupModule>('CpAppGroup');
