/** Chat pings per crew for the notifications page: read on this phone, changed through the queue. */
import type { CrewNotifyLevel, SetCrewNotifyPayload } from '@cp/domain';
import { msg } from '@lingui/core/macro';
import { useMemo } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import {
  CREW_MODES_SQL,
  CREW_MODES_TABLES,
  crewChatModes,
  QUEUED_CREW_MODES_SQL,
  queuedLevels,
  type CrewChatMode,
  type CrewModeRow,
} from './crew-chat-modes';

/** The same queued command the crew settings send, summarised the same way in the queue. */
const SET_CREW_NOTIFY = defineClientCommand<SetCrewNotifyPayload>({
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a command name.
  name: 'set_crew_notify',
  offline: true,
  summarize: () => msg({ id: 'crew.queued.notify', message: 'Crew notification setting' }),
});

export function useCrewChatModes(): {
  readonly modes: readonly CrewChatMode[];
  readonly loaded: boolean;
  readonly change: (crewId: string, level: CrewNotifyLevel) => void;
} {
  const uid = useOwnerUid();
  const crews = useLiveRows<CrewModeRow>(
    CREW_MODES_SQL,
    uid === null ? null : [uid],
    CREW_MODES_TABLES,
  );
  const queue = useLiveRows<{ envelope: string }>(QUEUED_CREW_MODES_SQL, [], ['commands']);
  const { send } = useCommand(SET_CREW_NOTIFY);
  const modes = useMemo(
    () => crewChatModes(crews.rows, queuedLevels(queue.rows.map((row) => row.envelope))),
    [crews.rows, queue.rows],
  );
  return {
    modes,
    loaded: crews.loaded,
    change: (crewId, level) => void send({ crew_id: crewId, level }),
  };
}
