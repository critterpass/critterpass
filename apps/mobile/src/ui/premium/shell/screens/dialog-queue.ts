/**
 * The designed dialogs' queue: a confirm card (3.15), a notice with one way on, and the options
 * sheet (7.15). One shows at a time, the rest wait their turn. Callers get a promise; a dialog that
 * is dismissed resolves as its way back. With no host on screen (a screen outside the premium
 * root) the caller falls back to the system alert.
 */
import type { ReactNode } from 'react';

export interface ConfirmDialog {
  readonly kind: 'confirm';
  readonly title: string;
  readonly message: string;
  readonly confirm: string;
  readonly cancel: string;
  readonly destructive: boolean;
  /** Who or what the question is about, drawn over the title (3.15's avatar). */
  readonly badge?: ReactNode;
}

export interface NoticeDialog {
  readonly kind: 'notice';
  readonly title: string;
  readonly message?: string | undefined;
  readonly ok: string;
}

export interface DialogOption {
  readonly label: string;
  readonly destructive?: boolean;
  readonly run: () => void;
}

export interface OptionsDialog {
  readonly kind: 'options';
  readonly header?: string | undefined;
  readonly options: readonly DialogOption[];
  readonly close: string;
}

export type DialogSpec = ConfirmDialog | NoticeDialog | OptionsDialog;

/** What a shown dialog ended with: true for the confirm action, false for every way back. */
export interface QueuedDialog {
  readonly id: number;
  readonly spec: DialogSpec;
  readonly settle: (chosen: boolean) => void;
}

type Listener = () => void;

export interface DialogQueue {
  /** The dialog on screen, or null. */
  readonly current: () => QueuedDialog | null;
  readonly subscribe: (listener: Listener) => () => void;
  /** Queues a dialog; null when no host is mounted to show it. */
  readonly show: (spec: DialogSpec) => Promise<boolean> | null;
  /** Ends the dialog on screen and shows the next. */
  readonly settle: (id: number, chosen: boolean) => void;
  /** A host counts itself while mounted. */
  readonly attach: () => () => void;
}

export function createDialogQueue(): DialogQueue {
  let hosts = 0;
  let nextId = 1;
  const waiting: QueuedDialog[] = [];
  const listeners = new Set<Listener>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    current: () => waiting[0] ?? null,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    show: (spec) => {
      if (hosts === 0) return null;
      return new Promise<boolean>((resolve) => {
        waiting.push({ id: nextId++, spec, settle: resolve });
        if (waiting.length === 1) emit();
      });
    },
    settle: (id, chosen) => {
      const head = waiting[0];
      if (head === undefined || head.id !== id) return;
      waiting.shift();
      head.settle(chosen);
      emit();
    },
    attach: () => {
      hosts += 1;
      return () => {
        hosts -= 1;
        // The last host gone: nothing can show what waits, so each ends as its way back.
        if (hosts === 0) {
          for (const left of waiting.splice(0)) left.settle(false);
          emit();
        }
      };
    },
  };
}

/** The app's one queue, read by the host in the premium root. */
export const dialogQueue = createDialogQueue();
