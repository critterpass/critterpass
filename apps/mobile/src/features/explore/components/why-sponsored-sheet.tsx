/**
 * "Why am I seeing this?" for a sponsored pick: who paid for the spot, that it is there because of
 * the place being looked at and never because of who is looking, that the guide's own picks are
 * never ranked by payment, and that Pass+ removes sponsored picks.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

export interface WhySponsoredSheetProps {
  /** The partner's name as they write it. */
  readonly partner: string;
  /** The destination the list belongs to. */
  readonly place: string;
  /** Opens Pass+; absent while that screen is not in the app. */
  readonly onPassPlus?: (() => void) | undefined;
  readonly onDismiss?: (() => void) | undefined;
}

const useStyles = makeStyles((t) => ({
  body: {
    gap: t.space['12'],
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['8'],
    paddingBottom: t.space['32'],
  },
}));

export function WhySponsoredSheet({
  partner,
  place,
  onPassPlus,
  onDismiss,
}: WhySponsoredSheetProps) {
  const styles = useStyles();
  const { t } = useLingui();
  const title = t({ id: 'explore.sponsored.sheetTitle', message: 'Why am I seeing this?' });
  return (
    <Sheet
      title={title}
      detents={['fit']}
      {...(onDismiss === undefined ? {} : { onDismiss })}
      accessibilityLabel={title}
      testID="explore-sponsored-sheet"
    >
      <View style={styles.body}>
        <Text variant="body">
          {t({
            id: 'explore.sponsored.paid',
            message: `${partner} paid for this spot in the list. It is marked SPONSORED so you can tell it from the guide's own picks.`,
          })}
        </Text>
        <Text variant="body">
          {t({
            id: 'explore.sponsored.contextual',
            message: `You see it because you're looking at ${place}. It isn't chosen from anything about you, and we don't track you for it.`,
          })}
        </Text>
        <Text variant="body">
          {t({
            id: 'explore.sponsored.neutral',
            message:
              "The guide's picks are never ranked by what a partner pays. We may earn a commission if you book through a partner.",
          })}
        </Text>
        <Text variant="body">
          {t({
            id: 'explore.sponsored.passPlus',
            message: 'Pass+ and boosted trips have no sponsored picks.',
          })}
        </Text>
        {onPassPlus === undefined ? null : (
          <PillButton
            label={t({ id: 'explore.sponsored.seePassPlus', message: 'See Pass+' })}
            onPress={onPassPlus}
            testID="explore-sponsored-pass-plus"
          />
        )}
      </View>
    </Sheet>
  );
}
