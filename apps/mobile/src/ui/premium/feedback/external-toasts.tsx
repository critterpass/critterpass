import { useEffect } from 'react';

import { useToast } from './ToastHost';

/** A toast another part of the app queued, as the premium stack reads it. */
export interface ExternalToast {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
}

/** A module-level toast queue (the current UI's island toast queue has this shape). */
export interface ExternalToastSource {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getCurrent: () => ExternalToast | null;
  readonly dismiss: () => void;
}

/**
 * Shows the toasts code outside the premium screens queues (`toast.show` from a runtime, a
 * notification handler) as premium toasts: each one is taken off its queue as it arrives, so the
 * current UI's island toast never draws it. Renders nothing; mount it under a `ToastHost`.
 */
export function ExternalToasts({ source }: { readonly source: ExternalToastSource }) {
  const toast = useToast();
  useEffect(() => {
    const take = () => {
      const current = source.getCurrent();
      if (current === null) return;
      source.dismiss();
      const message =
        current.subtitle === undefined ? current.title : `${current.title} ${current.subtitle}`;
      const { action } = current;
      toast.show(
        action === undefined
          ? { kind: 'done', message }
          : { kind: 'done', message, undo: action.onPress, actionLabel: action.label },
      );
    };
    take();
    // Taken after the queue's own notification has run: a queue that reads its current toast right
    // after notifying would otherwise find it gone mid-update.
    return source.subscribe(() => queueMicrotask(take));
  }, [source, toast]);
  return null;
}
