/**
 * Lab scenes for critter detail (3l-3): Tokek with its common and rare forms found (the guide's
 * own critter, so MAKE IT MY GUIDE shows), the same wearing its rare look, all four forms found,
 * and a local (Chép) with no guide button. The form picker and SHARE work (the share sheet draws
 * the real card), and WHERE TO FIND opens the where-to-find lab scenes; the other handlers are
 * no-ops.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';

import { tierWord } from '@/ui/critters/tier';
import { ShareImageSheet } from '@/ui/share-image/ShareImageSheet';

import { artKind } from '../art-kind';
import type { EntryRow } from '../data/queries';
import { shareAlt, shareLine } from '../detail/detail-copy';
import {
  buildDetail,
  type CritterDetailRow,
  type DetailForm,
  type DetailFormRow,
} from '../detail/detail-model';
import { DetailView } from '../detail/detail-view';
import { deviceShareDeps, renderCritterCard } from '../detail/share-card';
import { LAB_ENTRIES, LAB_FORMS } from './dex-fixtures';

const TOKEK: CritterDetailRow = {
  id: 'cp-112',
  key: 'cp-112',
  no: 112,
  city: 'Bali',
  canonical_seed: 7,
  note: "Lives in the spring pools at Tirta Empul. Only comes out when it's quiet.",
  set_name: 'Indonesia',
  hero_critter_key: 'cp-112',
  guide_slug: 'tokek',
  guide_id: 'guide-tokek',
  guide_name: 'Tokek',
};

const CHEP: CritterDetailRow = {
  ...TOKEK,
  id: 'cp-005',
  key: 'cp-005',
  no: 5,
  city: 'Hội An',
  canonical_seed: 5,
  note: 'Swims under the lanterns on the Thu Bồn after dark.',
  set_name: 'Vietnam',
  hero_critter_key: 'cp-001',
  guide_slug: null,
  guide_id: null,
  guide_name: null,
};

const HABITAT: Readonly<Record<string, string>> = { rare: 'Temple', epic: 'Batur' };
/** A form's own field note, as the catalogue writes them: a sentence. */
const FORM_NOTE: Readonly<Record<string, string>> = {
  rare: "Lives in the spring pools at Tirta Empul. Only comes out when it's quiet.",
};

function forms(critterId: string): DetailFormRow[] {
  return LAB_FORMS.filter((f) => f.critter_id === critterId).map((f) => ({
    ...f,
    note: FORM_NOTE[f.rarity] ?? null,
  }));
}

function entries(critterId: string, all = false): EntryRow[] {
  const mine = LAB_ENTRIES.filter((e) => e.critter_id === critterId).map((e) =>
    e.form_id.endsWith('-rare') ? { ...e, form_name: 'Temple Tokek' } : e,
  );
  if (!all) return mine;
  return forms(critterId).map((f) => ({
    ...(mine[0] as EntryRow),
    id: `entry-${f.id}`,
    form_id: f.id,
    form_name: f.rarity === 'common' ? 'Tokek' : `${HABITAT[f.rarity] ?? 'Golden'} Tokek`,
  }));
}

function Detail({
  critter = TOKEK,
  all = false,
  skin = null,
}: {
  readonly critter?: CritterDetailRow;
  readonly all?: boolean;
  readonly skin?: string | null;
}) {
  const [skinFormId, setSkin] = useState<string | null>(skin);
  const [sharing, setSharing] = useState<DetailForm | null>(null);
  const model = buildDetail(critter, forms(critter.id), entries(critter.id, all));
  const name = sharing === null ? '' : (sharing.name ?? model.name ?? '');
  return (
    <>
      <DetailView
        model={model}
        me="Winston"
        crew={critter.id === 'cp-112' ? ['Maya'] : []}
        guideName={critter.guide_name ?? 'Tokek'}
        skinFormId={skinFormId}
        onSkin={setSkin}
        onShare={setSharing}
        onWhere={(formId) =>
          router.push({
            pathname: '/(dev)/critters-scene',
            params: {
              scene: formId.endsWith('-legendary') ? '3l-3-where-legendary' : '3l-3-where-rare',
            },
          })
        }
      />
      {sharing === null ? null : (
        <ShareImageSheet
          visible
          onClose={() => setSharing(null)}
          altText={shareAlt(name, model.city)}
          formats={['post', 'story']}
          render={(format) =>
            renderCritterCard(
              {
                kind: artKind(model.key),
                seed: model.seed,
                form: sharing.spec,
                name,
                line: shareLine(tierWord(sharing.rarity), model.city),
              },
              format,
            )
          }
          deps={deviceShareDeps()}
        />
      )}
    </>
  );
}

export const DETAIL_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3l-3-detail': () => <Detail />,
  '3l-3-guide-look': () => <Detail skin="cp-112-rare" />,
  '3l-3-all-forms': () => <Detail all />,
  '3l-3-local': () => <Detail critter={CHEP} />,
};
