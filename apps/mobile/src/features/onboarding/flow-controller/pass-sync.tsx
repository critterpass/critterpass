/**
 * Carries the device's pass to the server once there is a session: reserves the pass number with
 * `start_pass` as soon as a draft exists (online only; offline the pass shows the placeholder), and
 * hands `issue_pass` to the offline queue once the pass is issued, where it replays until applied.
 * The server's number then arrives through the synced `passes` row.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names and SQL, never copy. */
import { useContext, useEffect, useRef } from 'react';

import { guideOfForm, type IssuePassPayload, type StartPassResult } from '@cp/domain';

import { defineClientCommand } from '@/data/commands/summaries';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { watchRows } from '@/data/status/watch-rows';
import { mirrorStickerAvatar, type AppGroupImageWriter } from '@/ui/avatar/app-group-mirror';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { getDefaultSkiaEngine } from '@/ui/sticker/Sticker';
import { msg } from '@lingui/core/macro';

import { readDraft, readPassSync, updateDraft, updatePassSync, usePassDraft } from './draft-store';

export const START_PASS = defineClientCommand<{ pass_id: string }>({
  name: 'start_pass',
  offline: false,
});

export const ISSUE_PASS = defineClientCommand<IssuePassPayload>({
  name: 'issue_pass',
  offline: true,
  summarize: () => msg({ id: 'onboarding.queued.issuePass', message: 'Your new pass' }),
});

function isStartPassResult(value: unknown): value is StartPassResult {
  return typeof (value as Partial<StartPassResult> | null)?.number === 'string';
}

export interface PassSyncProps {
  /** Writes the avatar PNG the notification extension shows (cp-app-group `writeImage`). */
  readonly writeAppGroupImage?: AppGroupImageWriter;
}

export function PassSync({ writeAppGroupImage }: PassSyncProps) {
  const localFirst = useContext(LocalFirstContext);
  const draft = usePassDraft();
  const starting = useRef(false);

  // Reserve the number while the user fills in the pass.
  useEffect(() => {
    if (localFirst === null || draft === null || draft.number !== null || starting.current) return;
    if (readPassSync().numberReserved || readPassSync().issueQueued) return;
    starting.current = true;
    void localFirst.commands
      .send(START_PASS, { pass_id: draft.pass_id })
      .then((result) => {
        if (result.kind === 'applied' && isStartPassResult(result.result)) {
          const number = result.result.number;
          updateDraft((d) => ({ ...d, number }));
          updatePassSync({ numberReserved: true });
        }
      })
      .finally(() => {
        starting.current = false;
      });
  }, [localFirst, draft]);

  // Queue the issue once, as soon as the pass is issued on the device.
  useEffect(() => {
    if (localFirst === null || draft === null || draft.issued_at === null) return;
    if (draft.avatar === null || draft.home_iata === null || readPassSync().issueQueued) return;
    updatePassSync({ issueQueued: true });
    const guide = draft.avatar.kind === 'critter' ? guideOfForm(draft.avatar.form_id) : null;
    if (guide !== null && writeAppGroupImage !== undefined) {
      try {
        mirrorStickerAvatar(GUIDE_STICKERS[guide].kind, getDefaultSkiaEngine(), writeAppGroupImage);
      } catch {
        // The extension falls back to initials; the pass itself is unaffected.
      }
    }
    void localFirst.commands
      .send(ISSUE_PASS, {
        pass_id: draft.pass_id,
        given_name: draft.given_name.trim(),
        avatar: draft.avatar,
        taste_answers: draft.answers,
        home_iata: draft.home_iata,
      })
      .then((result) => {
        if (result.kind === 'rejected' || result.kind === 'unavailable') {
          updatePassSync({ issueQueued: false });
        }
      });
  }, [localFirst, draft, writeAppGroupImage]);

  // The number the server gave the pass, once its row syncs down.
  useEffect(() => {
    if (
      localFirst === null ||
      draft === null ||
      draft.number !== null ||
      draft.issued_at === null
    ) {
      return undefined;
    }
    return watchRows<{ number: string | null }>(
      localFirst.db,
      `SELECT number FROM passes WHERE id = '${draft.pass_id}'`,
      ['passes'],
      (rows) => {
        const number = rows[0]?.number ?? null;
        if (number !== null && readDraft()?.number === null) updateDraft((d) => ({ ...d, number }));
      },
      // Before this build's schema has the table the query fails; the placeholder stays.
      () => undefined,
    );
  }, [localFirst, draft]);

  return null;
}
