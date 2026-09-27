import { toastQueue, type ToastRequest } from './queue';

export { IslandToast } from './IslandToast';
export { toastQueue, useToastQueue } from './queue';
export type { QueuedToast, ToastAction, ToastRequest } from './queue';

/** `toast.show(request)` / `toast.dismiss()` — the phase's Exports table name for `toastQueue`. */
export const toast = {
  show(request: ToastRequest): void {
    toastQueue.show(request);
  },
  dismiss(): void {
    toastQueue.dismiss();
  },
};
