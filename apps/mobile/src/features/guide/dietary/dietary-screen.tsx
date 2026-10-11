/**
 * The dietary capture sheet: the phone's copy first (refreshed from the server when online),
 * edited in place, saved through the offline queue. Turning sharing on without the
 * `dietary_visibility` consent shows the consent card; SHARE FLAGS grants it and saves, NOT NOW
 * leaves sharing off. Turning sharing off withdraws the consent, which deletes the crew's flags.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import { useLingui } from '@lingui/react/macro';
import { useContext, useRef, useState } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { makeStyles } from '@/ui';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { SessionWaiting } from '@/ui/states/SessionWaiting';

import type { DietaryServices } from './dietary-data';
import { DietaryView } from './dietary-view';
import { useDietaryForm } from './use-dietary-form';

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'] },
}));

/** The sheet once the session's local database is open (a cold start can restore it earlier). */
export function DietaryScreen(props: { readonly services: DietaryServices }) {
  const localFirst = useContext(LocalFirstContext);
  return localFirst === null ? (
    <SessionWaiting testID="guide-dietary-waiting" />
  ) : (
    <OpenDietaryScreen {...props} />
  );
}

function OpenDietaryScreen({ services }: { readonly services: DietaryServices }) {
  const styles = useStyles();
  const { t } = useLingui();
  const form = useDietaryForm(services);
  const { profile, edit, save, wasSharing } = form;
  const [asking, setAsking] = useState(false);
  const scroll = useRef<{ scrollToEnd: (options?: { animated?: boolean }) => void }>(null);

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
          saving={form.saving}
          saved={form.saved}
          onShareChange={(share) => {
            if (share && !form.consented && !wasSharing) {
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
