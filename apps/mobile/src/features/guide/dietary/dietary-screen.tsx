/**
 * The dietary capture sheet: the phone's copy first (refreshed from the server when online),
 * edited in place, saved through the offline queue. Turning sharing on without the
 * `dietary_visibility` consent shows the consent card; SHARE FLAGS grants it and saves, NOT NOW
 * leaves sharing off. Turning sharing off withdraws the consent, which deletes the crew's flags.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { makeStyles } from '@/ui';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

import {
  EMPTY_PROFILE,
  refreshDietary,
  useDietary,
  useSaveDietary,
  type DietaryProfile,
  type DietaryServices,
} from './dietary-data';
import { DietaryView } from './dietary-view';

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'] },
}));

export function DietaryScreen({ services }: { readonly services: DietaryServices }) {
  const styles = useStyles();
  const { t } = useLingui();
  const { db } = useLocalFirst();
  const stored = useDietary();
  const actions = useSaveDietary();
  const [draft, setDraft] = useState<DietaryProfile | null>(null);
  const [asking, setAsking] = useState(false);
  const [saved, setSaved] = useState(false);
  const scroll = useRef<{ scrollToEnd: (options?: { animated?: boolean }) => void }>(null);

  useEffect(() => {
    void refreshDietary(db, services, new Date());
  }, [db, services]);

  const profile = draft ?? stored.profile ?? EMPTY_PROFILE;
  const wasSharing = stored.profile?.visibility === 'crew_flags';
  const edit = (next: DietaryProfile) => {
    setDraft(next);
    setSaved(false);
  };
  const save = async (next: DietaryProfile, grantConsent = false) => {
    if (wasSharing && next.visibility === 'self') await actions.stopSharing(next);
    else await actions.save(next, { grantConsent });
    setDraft(null);
    setSaved(true);
  };

  return (
    <Sheet
      detents={['large']}
      title={t({ id: 'guide.dietary.title', message: 'Food and access needs' })}
      testID="guide-dietary-sheet"
    >
      <SheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.body}
        // The consent card opens under the sharing toggle: bring it into view.
        onContentSizeChange={() => {
          if (asking) scroll.current?.scrollToEnd({ animated: true });
        }}
        // React 19 passes `ref` as a prop, through to the scroll view.
        {...({ ref: scroll } as object)}
      >
        <DietaryView
          profile={profile}
          onChange={edit}
          saving={actions.pending}
          saved={saved}
          onShareChange={(share) => {
            if (share && !stored.consented && !wasSharing) {
              setAsking(true);
              return;
            }
            edit({ ...profile, visibility: share ? 'crew_flags' : 'self' });
          }}
          asking={
            asking
              ? {
                  onShare: () => {
                    setAsking(false);
                    void save({ ...profile, visibility: 'crew_flags' }, true);
                  },
                  onNotNow: () => setAsking(false),
                }
              : null
          }
          onSave={() => void save(profile)}
        />
      </SheetScrollView>
    </Sheet>
  );
}
