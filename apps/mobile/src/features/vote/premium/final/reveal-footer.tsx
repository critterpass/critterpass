/**
 * The winner stamp's way on (4.06): the organiser sets the place up; everyone else learns who has
 * the setup and goes back home. Under it, the place that lost goes back in the deck.
 */
import { useLingui } from '@lingui/react/macro';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text, makePremiumStyles, usePremiumTheme } from '@/ui/premium';

const useStyles = makePremiumStyles((t) => ({
  footer: { paddingHorizontal: t.space.titleGutter, gap: t.space.gap12, alignItems: 'center' },
}));

export function RevealFooter(props: {
  readonly style: StyleProp<ViewStyle>;
  readonly organiser: boolean;
  readonly organiserName: string | null;
  readonly winnerName: string;
  readonly loserName: string | null;
  readonly onSetUp: () => void;
  readonly onLeave: () => void;
}) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const { organiserName, winnerName, loserName } = props;
  return (
    <Animated.View
      style={[styles.footer, { paddingBottom: insets.bottom + theme.space.gap16 }, props.style]}
    >
      {props.organiser ? (
        <Button
          label={t({ id: 'vote.premium.reveal.setUp', message: `Set up ${winnerName}` })}
          onPress={props.onSetUp}
          testID="reveal-set-up"
        />
      ) : (
        <>
          <Text variant="caption" tone="muted" align="center" testID="reveal-setup-with">
            {organiserName === null
              ? t({
                  id: 'vote.reveal.setupWithOrganiser',
                  message: 'The organiser sets it up next.',
                })
              : t({ id: 'vote.reveal.setupWith', message: `Setup is with ${organiserName}.` })}
          </Text>
          <Button
            label={t({ id: 'vote.premium.reveal.backHome', message: 'Back home' })}
            onPress={props.onLeave}
            testID="reveal-back-home"
          />
        </>
      )}
      {loserName === null ? null : (
        <Text variant="caption" tone="muted" align="center">
          {t({
            id: 'vote.reveal.backInDeck',
            message: `${loserName} goes back in the deck for next time`,
          })}
        </Text>
      )}
    </Animated.View>
  );
}
