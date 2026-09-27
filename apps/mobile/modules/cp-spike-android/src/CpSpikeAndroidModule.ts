import { NativeModule, requireNativeModule } from 'expo';

declare class CpSpikeAndroidModule extends NativeModule {
  canUseFullScreenIntent(): boolean;
  openFullScreenIntentSettings(): void;
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): void;
  scheduleFullScreenAlarm(delaySeconds: number): void;
  cancelFullScreenAlarm(): void;
  simulateLiveUpdatePush(type: string, op: string, stateJson: string): void;
  dismissLiveUpdate(): void;
}

export const cpSpikeAndroidNativeModule =
  requireNativeModule<CpSpikeAndroidModule>('CpSpikeAndroid');
