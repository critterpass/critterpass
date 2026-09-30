/**
 * Guide lab scenes for food and access needs: empty, filled in, the consent question when sharing
 * is turned on, and saved while sharing.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import { makeStyles } from '@/ui';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

import { EMPTY_PROFILE, type DietaryProfile } from '../dietary-data';
import { DietaryView } from '../dietary-view';

const noop = () => undefined;

const FILLED: DietaryProfile = {
  diet: 'vegetarian',
  allergies: ['peanuts', 'shellfish', 'kiwi'],
  avoid: ['coriander', 'durian'],
  spice: 'mild',
  accessibility_notes: 'Knee surgery in June: no long stairs or steep walks.',
  visibility: 'self',
};

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'] },
}));

function Scene({
  profile,
  asking = false,
  saved = false,
}: {
  readonly profile: DietaryProfile;
  readonly asking?: boolean;
  readonly saved?: boolean;
}) {
  const styles = useStyles();
  const { t } = useLingui();
  return (
    <Sheet
      detents={['large']}
      title={t({ id: 'guide.dietary.title', message: 'Food and access needs' })}
      testID="guide-dietary-sheet"
    >
      <SheetScrollView contentContainerStyle={styles.body}>
        <DietaryView
          profile={profile}
          onChange={noop}
          onSave={noop}
          onShareChange={noop}
          saved={saved}
          asking={asking ? { onShare: noop, onNotNow: noop } : null}
        />
      </SheetScrollView>
    </Sheet>
  );
}

export const DIETARY_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'dietary-empty': () => <Scene profile={EMPTY_PROFILE} />,
  'dietary-filled': () => <Scene profile={FILLED} />,
  'dietary-consent': () => <Scene profile={FILLED} asking />,
  'dietary-saved': () => <Scene profile={{ ...FILLED, visibility: 'crew_flags' }} saved />,
};
