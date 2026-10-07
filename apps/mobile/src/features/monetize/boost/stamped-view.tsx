/**
 * Stamped (4b-5): the BOOSTED stamp once the server's boost row for the trip is on. Until that
 * row arrives the page says the boost is being finished, and stamps nothing.
 */
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { Stamp } from '@/ui/documents/Stamp';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Scaffold, SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface StampedViewProps {
  /** The server's boost row for this trip is on. */
  readonly boosted: boolean;
  readonly destination: string;
  readonly crew: string;
  /** The boost's window, formatted; empty while unknown. */
  readonly window: string;
  /** The cost was split: every share is an entry in Balances. */
  readonly split: boolean;
  /** The crewmates whose share is written, in the order their rows arrived. */
  readonly owing?: ReadonlyArray<{ readonly uid: string; readonly name: string }>;
  /** Each crewmate's share, formatted; null until the shares are written. */
  readonly eachShare?: string | null;
  /** TELL THE CREW: posts the boost's card to the crew chat. Absent for a boost with no crew to tell. */
  readonly onTell?: () => void;
  /** The card is already in the crew chat. */
  readonly told?: boolean;
  readonly telling?: boolean;
  readonly onDone: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { flexGrow: 1 },
  page: {
    backgroundColor: t.color.paper.base,
    borderBottomStartRadius: t.radius.xl,
    borderBottomEndRadius: t.radius.xl,
    padding: t.size.gutter,
    paddingTop: t.space['32'] * 2,
    paddingBottom: t.space['32'],
    gap: t.space['24'],
  },
  stamp: { alignItems: 'center', paddingVertical: t.space['24'] },
  body: { padding: t.size.gutter, gap: t.space['12'], flexGrow: 1 },
  spacer: { flex: 1 },
}));

export function StampedView(props: StampedViewProps) {
  // The purchase is finished: there is no sheet to go back to, only Done.
  useNoBackByDesign();
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { destination } = props;
  const owing = props.owing ?? [];
  const each = props.eachShare ?? null;
  const names = format.list(
    locale,
    owing.map((member) => member.name),
  );
  const splitLine =
    owing.length > 0 && each !== null
      ? owing.length === 1
        ? t({
            id: 'monetize.stamped.owesLine',
            message: `${names} owes you ${each}. It’s in Balances.`,
          })
        : t({
            id: 'monetize.stamped.oweLine',
            message: `${names} each owe you ${each}. It’s in Balances.`,
          })
      : // The boost is on; its shares are written as soon as the store's price is confirmed.
        t({
          id: 'monetize.stamped.splitPending',
          message: 'The boost is on. The split is still being added to Balances.',
        });
  return (
    <Scaffold variant="dark" edges={['bottom']} testID="stamped">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.page}>
          <SurfaceToneProvider value="paper">
            <Row justify="space-between" importantForAccessibility="no-hide-descendants">
              <Text variant="monoData">
                {t({ id: 'monetize.compare.chrome', message: 'ENTRIES · ENTRÉES' })}
              </Text>
              <Text variant="monoData">
                {t({ id: 'monetize.compare.page', message: 'PAGE 08' })}
              </Text>
            </Row>
            <View style={styles.stamp}>
              <Stamp
                shape={props.boosted ? 'rect' : 'pending'}
                size={200}
                tilt={-7}
                ink={props.boosted ? theme.color.pink : theme.color.paper.muted}
                top={upper(props.crew, locale)}
                title={
                  props.boosted
                    ? upper(t({ id: 'monetize.stamped.stamp', message: 'Boosted' }), locale)
                    : '…'
                }
                bottom={upper(
                  props.window === '' ? destination : `${destination} · ${props.window}`,
                  locale,
                )}
                slam={props.boosted}
                testID={props.boosted ? 'stamped-stamp' : 'stamped-pending'}
              />
            </View>
          </SurfaceToneProvider>
        </View>
        <View style={styles.body}>
          <Text variant="h1" accessibilityRole="header" testID="stamped-title">
            {props.boosted
              ? props.split
                ? t({ id: 'monetize.stamped.crewIn', message: 'The crew’s in' })
                : t({ id: 'monetize.stamped.onYou', message: `${destination} is boosted` })
              : t({ id: 'monetize.stamped.finishing', message: 'Finishing up' })}
          </Text>
          {props.boosted && props.split && owing.length > 0 ? (
            <AvatarStack
              size="sm"
              members={owing.map((member, index) => ({
                key: member.uid,
                name: member.name,
                joinIndex: index,
              }))}
              testID="stamped-owing"
            />
          ) : null}
          <Text variant="bodyLg" color={theme.semantic.text.secondary} testID="stamped-line">
            {props.boosted
              ? props.split
                ? splitLine
                : t({
                    id: 'monetize.stamped.coverLine',
                    message: 'It’s on for the whole crew, on you.',
                  })
              : t({
                  id: 'monetize.stamped.finishingLine',
                  message:
                    'You’ve paid. The boost turns on by itself in a moment; there is nothing more to do.',
                })}
          </Text>
          <View style={styles.spacer} />
          {props.boosted && props.onTell !== undefined ? (
            <Stack gap="8">
              <PillButton
                label={
                  props.told === true
                    ? t({ id: 'monetize.stamped.told', message: 'The crew knows' })
                    : t({ id: 'monetize.stamped.tell', message: 'Tell the crew' })
                }
                tone="pink"
                onPress={props.told === true ? () => undefined : props.onTell}
                disabled={props.told === true}
                loading={props.telling === true}
                block
                testID="stamped-tell"
              />
              <InlineAction
                label={t({ id: 'monetize.welcome.done', message: 'Done' })}
                onPress={props.onDone}
                testID="stamped-done"
              />
            </Stack>
          ) : (
            <Stack>
              <PillButton
                label={t({ id: 'monetize.welcome.done', message: 'Done' })}
                tone="pink"
                onPress={props.onDone}
                block
                testID="stamped-done"
              />
            </Stack>
          )}
        </View>
      </ScrollView>
    </Scaffold>
  );
}
