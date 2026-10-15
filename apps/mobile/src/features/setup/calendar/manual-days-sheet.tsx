/**
 * Mark days by hand (undesigned; the dates step's own month grid in a sheet): one month at a time
 * from today to the six-month horizon, swiped sideways. Pick a tool, Free / Maybe / Busy, then tap
 * or hold and drag to paint days; painting a day already in that state clears it. Each state has
 * a glyph and a label, and Maybe a dashed edge, so none is colour alone. Save queues
 * `set_availability` (works offline).
 */
import { useEffect, useState, type ComponentType } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';

import { setAvailabilityCommand } from '../data/commands';
import { useSetupServices } from '../data/services';
import {
  loadMarks,
  manualPayload,
  saveMarks,
  type ManualMark,
  type ManualMarks,
} from './manual-days';
import { syncRange } from './sync-plan';

export interface ManualDaysViewProps {
  /** First and last dates that can be marked (today to the horizon). */
  readonly from: string;
  readonly to: string;
  readonly marks: ManualMarks;
  readonly page: number;
  readonly saving: boolean;
  readonly onPage: (page: number) => void;
  readonly onMarks: (marks: ManualMarks) => void;
  readonly onSave: () => void;
  readonly onDismiss: () => void;
  /** The tool it opens with (Free unless a lab scene says otherwise). */
  readonly initialTool?: ManualMark | undefined;
}

export interface ManualDaysSheetProps {
  readonly tripId: string;
  readonly onDismiss: () => void;
  /** The member's zone (the device's by default). */
  readonly tz?: string;
  /** How the sheet is drawn. */
  readonly View: ComponentType<ManualDaysViewProps>;
}

export function ManualDaysSheet({ tripId, onDismiss, tz, View: Look }: ManualDaysSheetProps) {
  const { db } = useLocalFirst();
  const services = useSetupServices();
  const { send } = useCommand(setAvailabilityCommand);
  const range = syncRange(
    new Date(services.now()),
    tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [saved, setSaved] = useState<ManualMarks>({});
  const [marks, setMarks] = useState<ManualMarks>({});
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void loadMarks(db).then((stored) => {
      if (!live) return;
      setSaved(stored);
      setMarks(stored);
    });
    return () => {
      live = false;
    };
  }, [db]);

  const onSave = () => {
    setSaving(true);
    void send(manualPayload(tripId, marks, saved))
      .then(async (sent) => {
        if (sent.kind === 'rejected') return;
        await saveMarks(db, marks, new Date(services.now()));
        onDismiss();
      })
      .finally(() => setSaving(false));
  };

  return (
    <Look
      from={range.from}
      to={range.to}
      marks={marks}
      page={page}
      saving={saving}
      onPage={setPage}
      onMarks={setMarks}
      onSave={onSave}
      onDismiss={onDismiss}
    />
  );
}
