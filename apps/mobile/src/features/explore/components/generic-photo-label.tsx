/**
 * The quiet line on a place's photo when it is a generic stock one (a similar dish, a beach like
 * it), so it never passes for the place itself. Sits in the photo's start corner, opposite the
 * licence credit; nothing for the place's own photo or no photo.
 */
import type { PlaceMediaAsset } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { isGenericPhoto } from '../place-photo';

const useStyles = makeStyles((t) => ({
  label: {
    position: 'absolute',
    start: t.space['12'],
    paddingHorizontal: t.space['6'],
    // On ink, so the line reads on a photo in its own colours.
    backgroundColor: t.semantic.bg.base,
    borderRadius: t.radius.xs,
    overflow: 'hidden',
    opacity: 0.85,
  },
}));

export function GenericPhotoLabel({
  photo,
  at = 'bottom',
  inset = 6,
}: {
  readonly photo: PlaceMediaAsset | null | undefined;
  readonly at?: 'top' | 'bottom';
  /** How far from that edge. */
  readonly inset?: number;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  if (!isGenericPhoto(photo)) return null;
  return (
    <Text
      variant="caption"
      color={theme.semantic.text.secondary}
      numberOfLines={1}
      style={[styles.label, at === 'top' ? { top: inset } : { bottom: inset }]}
      testID="explore-photo-generic"
    >
      {t({ id: 'explore.photo.notThisPlace', message: 'Not this place' })}
    </Text>
  );
}
