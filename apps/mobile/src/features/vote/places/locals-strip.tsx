/**
 * THE LOCALS on a guest page (3b-8): the place's locals as silhouettes breathing faintly in their
 * slots, "0/3 · FOUND BY BEING THERE". Tapping one gives a hint about where it lives, never its
 * name; locals are found by being there, so none is found from this page.
 */
import { useLingui } from '@lingui/react/macro';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { toast, useLoop } from '@/motion';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { upper } from '../format';

const SLOT = 72;

const useStyles = makeStyles((th) => ({
  slot: {
    width: SLOT,
    height: SLOT,
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

function LocalSlot({
  hint,
  index,
  onPress,
}: {
  readonly hint: string;
  readonly index: number;
  readonly onPress: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const breathe = useLoop('pulse', { offset: index * 0.3 });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'vote.guest.localHint', message: `A local. Hint: ${hint}` })}
      onPress={onPress}
      testID={`guest-local-${index}`}
    >
      <Animated.View style={[styles.slot, breathe]}>
        <Text variant="h2" color={theme.semantic.text.secondary}>
          ?
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function LocalsStrip({
  locals,
}: {
  readonly locals: readonly { readonly id: string; readonly hint: string }[];
}) {
  const theme = useTheme();
  const { t, i18n } = useLingui();
  if (locals.length === 0) return null;
  const total = locals.length;
  return (
    <Stack gap="8" testID="guest-locals">
      <Row justify="space-between" align="center">
        <Text variant="eyebrow" color={theme.semantic.action.primary}>
          {upper(t({ id: 'vote.guest.locals', message: 'The locals' }), i18n.locale)}
        </Text>
        <Text variant="label" color={theme.semantic.text.secondary}>
          {upper(
            t({ id: 'vote.guest.found', message: `0/${total} · found by being there` }),
            i18n.locale,
          )}
        </Text>
      </Row>
      <Row gap="10" wrap>
        {locals.map((local, index) => (
          <View key={local.id}>
            <LocalSlot
              hint={local.hint}
              index={index}
              onPress={() =>
                toast.show({
                  // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
                  id: `guest-local-${local.id}`,
                  title: local.hint,
                })
              }
            />
          </View>
        ))}
      </Row>
    </Stack>
  );
}
