/**
 * Renaming a crew from its settings. The new name goes through the offline queue, so its answer
 * comes later: the typed name stays in the field until the crew's own row carries it, and if the
 * server refuses it the field keeps the name to be fixed and a toast says it did not save.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and toast keys, never copy. */
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';

import { crewNameSchema, normaliseCrewName } from '@cp/domain';

import type { CommandClient } from '@/data/commands/client';
import { useQuietLiveRows } from '@/data/powersync/live-rows';
import { toast } from '@/motion/island-toast';

import { rowId, UPDATE_CREW } from '../crews-sheet/crew-commands';

const REFUSED_SQL = 'SELECT id FROM rejected_commands WHERE id = ?';
const REFUSED_TABLES = ['rejected_commands'];

export interface CrewRename {
  /** What the name field shows: the draft while there is one, else the crew's name. */
  readonly value: string;
  readonly onChange: (next: string) => void;
  /** The draft is a valid name the crew does not have, and no save of it is on its way. */
  readonly canSave: boolean;
  /** A save is queued and has not been answered. */
  readonly saving: boolean;
  readonly save: () => void;
}

export function useCrewRename(
  crewId: string,
  crewName: string | null,
  commands: Pick<CommandClient, 'send'> | null,
): CrewRename {
  const [draft, setDraft] = useState<string | null>(null);
  const [sent, setSent] = useState<{ readonly opId: string; readonly name: string } | null>(null);
  const refused = useQuietLiveRows<{ id: string }>(
    REFUSED_SQL,
    sent === null ? null : [sent.opId],
    REFUSED_TABLES,
  ).rows.some((row) => row.id === sent?.opId);

  // The crew's row now carries the name that was sent: the draft has done its job.
  const landed = sent !== null && crewName === sent.name;
  useEffect(() => {
    if (!landed) return;
    setSent(null);
    setDraft(null);
  }, [landed]);
  useEffect(() => {
    if (!refused) return;
    setSent(null);
    toast.show({
      id: rowId('crew-rename-refused', crewId),
      title: t({
        id: 'crew.settings.renameRefused',
        message: 'That name didn’t save. Try another one.',
      }),
    });
  }, [refused, crewId]);

  const value = draft ?? crewName ?? '';
  const next = normaliseCrewName(value);
  const saving = sent !== null && !refused && !landed;
  return {
    value,
    onChange: setDraft,
    canSave:
      commands !== null && !saving && crewNameSchema.safeParse(value).success && next !== crewName,
    saving,
    save: () => {
      if (commands === null) return;
      void commands.send(UPDATE_CREW, { crew_id: crewId, name: next }).then((result) => {
        if (result.kind === 'queued') setSent({ opId: result.opId, name: next });
      });
    },
  };
}
