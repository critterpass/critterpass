/**
 * One sharing action at a time, with its answer. Publishing, agreeing, declining, taking a yes
 * back, unpublishing and switching a link off all ask the server and wait: the buttons are off
 * while one is out, the person is told what happened, and the screen reloads only once it went
 * through (so it never re-reads the old state and looks as if nothing happened).
 */
import { useRef, useState } from 'react';

import type { SendResult } from '@/data/commands/client';
import { useCommandFeedback } from '@/motion/island-toast';

export interface PublishAction {
  readonly busy: boolean;
  /** Runs `send` unless another action is out; `done` is the line shown once it went through. */
  readonly run: (send: () => Promise<SendResult>, done: string) => void;
}

export function usePublishAction(onChanged: () => void): PublishAction {
  const { report } = useCommandFeedback();
  const out = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = (send: () => Promise<SendResult>, done: string) => {
    if (out.current) return;
    out.current = true;
    setBusy(true);
    void send()
      .then((result) => {
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
        if (report(result, { done, id: 'community-publish' }) === 'done') onChanged();
      })
      .finally(() => {
        out.current = false;
        setBusy(false);
      });
  };
  return { busy, run };
}
