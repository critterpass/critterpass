/**
 * SHARE RECAP (3m-1), undesigned sheet: the recap goes out as an image (the card drawn on the
 * phone) or as a link to its public page, and a traveller with a live link can switch it off. The
 * link row says what the page shows, so nobody shares more than they meant to.
 */
import type { DistanceUnit } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { ListCard } from '@/ui/cards/ListCard';
import { Stack } from '@/ui/layout/Stack';
import type { GuideId } from '@/ui/people/GuideLine';
import { Sheet } from '@/ui/sheet/Sheet';

import type { RecapLinkActions } from '../link/use-recap-link';
import { RecapShareSheet } from './share-sheet';
import type { SummaryModel } from './summary-model';

export interface RecapShareProps {
  readonly model: SummaryModel;
  readonly guide: GuideId;
  readonly unit: DistanceUnit;
  readonly link: RecapLinkActions;
  readonly onClose: () => void;
}

export function RecapShare({ model, guide, unit, link, onClose }: RecapShareProps) {
  const { t } = useLingui();
  const [image, setImage] = useState(false);
  if (image) {
    return <RecapShareSheet model={model} guide={guide} unit={unit} onClose={onClose} />;
  }
  const count = link.stoppable;
  return (
    <Sheet
      detents={['fit']}
      title={t({ id: 'recap.share.title', message: 'Share the recap' })}
      onDismiss={onClose}
      testID="recap-share-choice"
    >
      <Stack gap="12" padding="16">
        <ListCard
          title={t({ id: 'recap.share.image', message: 'Share an image' })}
          subtitle={t({
            id: 'recap.share.imageLine',
            message: 'The recap card, for a post or a story.',
          })}
          onPress={() => setImage(true)}
          testID="recap-share-image"
        />
        <ListCard
          title={t({ id: 'recap.share.link', message: 'Share a link' })}
          subtitle={t({
            id: 'recap.share.linkLine',
            message:
              'A web page anyone with the link can open: the place, the month, how far you went, places on the trail and first names. No photos, no money.',
          })}
          {...(link.busy ? {} : { onPress: () => void link.share() })}
          testID="recap-share-link"
        />
        {count > 0 ? (
          <ListCard
            title={t({ id: 'recap.share.stop', message: 'Stop sharing' })}
            subtitle={t({
              id: 'recap.share.stopLine',
              message: plural(count, {
                one: 'Switches off # link. It opens nothing after that.',
                other: 'Switches off # links. They open nothing after that.',
              }),
            })}
            {...(link.busy ? {} : { onPress: () => void link.stop() })}
            testID="recap-share-stop"
          />
        ) : null}
      </Stack>
    </Sheet>
  );
}
