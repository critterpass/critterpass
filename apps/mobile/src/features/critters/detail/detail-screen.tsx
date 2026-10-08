/**
 * A critter's detail over synced rows: my own finds of its forms, the guide's look (MAKE IT MY
 * GUIDE queues `set_guide_skin`, shows at once and offers Undo), and the share card for a found
 * form. Crewmates who have it come from the crew's live finds this session.
 */
import { router } from 'expo-router';
import { useState } from 'react';

import { toast } from '@/motion';

import { artKind } from '../art-kind';
import { unknownName } from '../critters-copy';
import { useCrewSightings } from '../data/crew-sightings';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import type { EntryRow } from '../data/queries';
import { whereRoute } from '../routes';
import { CritterShare } from './critter-share';
import { skinReverted, skinToast, undo } from './detail-copy';
import {
  buildDetail,
  CRITTER_SQL,
  CRITTER_TABLES,
  DETAIL_FORMS_SQL,
  DETAIL_FORMS_TABLES,
  MY_ENTRIES_SQL,
  MY_ENTRIES_TABLES,
  type CritterDetailRow,
  type DetailForm,
  type DetailFormRow,
} from './detail-model';
import { DetailView } from './detail-view';
import { useGuideSkinControl } from './guide-skin';

// eslint-disable-next-line lingui/no-unlocalized-strings -- SQL, never copy.
const ME_NAME_SQL = 'SELECT display_name FROM users WHERE id = ?';

export function DetailScreen({ critterId }: { readonly critterId: string }) {
  const uid = useOwnerUid();
  const critter = useLiveRows<CritterDetailRow>(CRITTER_SQL, [critterId], CRITTER_TABLES).rows[0];
  const forms = useLiveRows<DetailFormRow>(DETAIL_FORMS_SQL, [critterId], DETAIL_FORMS_TABLES);
  const entries = useLiveRows<EntryRow>(
    MY_ENTRIES_SQL,
    uid === null ? null : [uid, critterId],
    MY_ENTRIES_TABLES,
  );
  const me = useLiveRows<{ display_name: string | null }>(
    ME_NAME_SQL,
    uid === null ? null : [uid],
    ['users'],
  ).rows[0];
  const crew = useCrewSightings(critterId);
  const skin = useGuideSkinControl(critter?.guide_id ?? null);
  const [sharing, setSharing] = useState<DetailForm | null>(null);
  if (critter === undefined || !forms.loaded || !entries.loaded) return null;
  const model = buildDetail(critter, forms.rows, entries.rows);
  const nameOf = (form: DetailForm) => form.name ?? model.name ?? unknownName();

  const onSkin = (formId: string | null) => {
    const before = skin.current;
    skin.set(formId);
    const form = model.forms.find((f) => f.id === formId);
    toast.show({
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast de-dupe key, never copy.
      id: `critters-skin-${formId ?? 'classic'}`,
      title: form === undefined ? skinReverted() : skinToast(nameOf(form)),
      action: { label: undo(), onPress: () => skin.set(before) },
    });
  };

  return (
    <>
      <DetailView
        model={model}
        me={me?.display_name ?? ''}
        crew={crew}
        guideName={critter.guide_name}
        skinFormId={skin.current}
        onSkin={onSkin}
        onShare={setSharing}
        onWhere={(formId) => router.push(whereRoute(formId))}
      />
      {sharing === null ? null : (
        <CritterShare
          kind={artKind(model.key)}
          seed={model.seed}
          city={model.city}
          form={sharing}
          name={nameOf(sharing)}
          onClose={() => setSharing(null)}
        />
      )}
    </>
  );
}
