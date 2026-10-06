/**
 * The welcome after Pass+ is confirmed (4e-3): the visa, the ADMITTED stamp with the date, the
 * perks the server lists, and when it renews or ends. A purchase gets the celebration; Pass+ that
 * came back from a restore or a code gets the same page without it.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { mrzLine } from '@/ui/documents/mrz';
import { Stamp } from '@/ui/documents/Stamp';
import { Visa } from '@/ui/documents/Visa';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PerksChecklist } from '@/ui/monetize/PerksChecklist';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold, SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { PerkLine } from '../perks/perk-copy';

export interface WelcomeViewProps {
  readonly name: string;
  /** False while the server has not said Pass+ is on: the page waits rather than celebrate. */
  readonly passPlus: boolean;
  readonly celebrate: boolean;
  /** The day Pass+ was admitted, formatted for the stamp. */
  readonly admittedOn: string;
  readonly perks: readonly PerkLine[];
  /** "Yearly · renews 2 Nov 2027", or when it ends; null when there is nothing to say. */
  readonly renewal: string | null;
  /** Absent while the icon picker has no route. */
  readonly onPickIcon?: (() => void) | undefined;
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
    gap: t.space['16'],
  },
  body: { padding: t.size.gutter, gap: t.space['20'], flexGrow: 1 },
  spacer: { flex: 1 },
}));

export function WelcomeView(props: WelcomeViewProps) {
  const { t, i18n } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const name = props.name.trim();
  const colours = [theme.color.yellow, theme.semantic.state.success, theme.color.pink];
  return (
    <Scaffold variant="dark" edges={['bottom']} testID="welcome">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.page}>
          <SurfaceToneProvider value="paper">
            <Row justify="space-between" importantForAccessibility="no-hide-descendants">
              <Text variant="monoData">
                {t({ id: 'monetize.paywall.chrome', message: 'VISAS · VISAS · VISAS' })}
              </Text>
              <Text variant="monoData">
                {t({ id: 'monetize.paywall.page', message: 'PAGE 07' })}
              </Text>
            </Row>
            <Visa
              kind="passPlus"
              eyebrow={t({
                id: 'monetize.paywall.visaEyebrow',
                message: 'Visa · For you · Pour vous',
              })}
              title={t({ id: 'monetize.paywall.passPlus', message: 'Pass+' })}
              photo={<Sticker kind="gecko" name="Tokek" size={52} />}
              fields={[
                {
                  key: 'holder',
                  label: t({ id: 'monetize.paywall.holder', message: 'Holder' }),
                  value: name,
                },
                {
                  key: 'works',
                  label: t({ id: 'monetize.paywall.worksIn', message: 'Works in' }),
                  value: t({ id: 'monetize.paywall.everyCrew', message: 'Every crew' }),
                },
              ]}
              perk=""
              mrz={mrzLine(['V', 'CPPASS', 'PLUS', name])}
              accessibilityLabel={t({
                id: 'monetize.welcome.visaLabel',
                message: `Pass+ visa, holder ${name}`,
              })}
              testID="welcome-visa"
            />
            {props.passPlus ? (
              <Stamp
                title={upper(t({ id: 'monetize.welcome.admitted', message: 'Admitted' }), locale)}
                top={upper(t({ id: 'monetize.welcome.entry', message: 'Entry' }), locale)}
                bottom={upper(props.admittedOn, locale)}
                ink={theme.color.blue}
                size={128}
                slam={props.celebrate}
                testID="welcome-stamp"
              />
            ) : null}
          </SurfaceToneProvider>
        </View>
        <View style={styles.body}>
          {props.passPlus ? (
            <>
              <Text variant="h1" accessibilityRole="header" testID="welcome-title">
                {name === ''
                  ? t({ id: 'monetize.welcome.title', message: 'You’re in' })
                  : t({ id: 'monetize.welcome.titleNamed', message: `You’re in, ${name}` })}
              </Text>
              <PerksChecklist
                perks={props.perks.map((line, index) => ({
                  id: line.key,
                  text: i18n._(line.copy),
                  color: colours[index % colours.length] ?? theme.color.yellow,
                }))}
                testID="welcome-perks"
              />
            </>
          ) : (
            <Stack gap="8">
              <Text variant="h2" accessibilityRole="header" testID="welcome-waiting">
                {t({ id: 'monetize.welcome.waiting', message: 'Almost there' })}
              </Text>
              <Text variant="bodyLg" color={theme.semantic.text.secondary}>
                {t({
                  id: 'monetize.welcome.waitingLine',
                  message:
                    'We’re still confirming Pass+ with the store. It turns on by itself; nothing more to pay.',
                })}
              </Text>
            </Stack>
          )}
          <View style={styles.spacer} />
          <Stack gap="12">
            {props.passPlus && props.onPickIcon ? (
              <PillButton
                label={t({ id: 'monetize.welcome.pickIcon', message: 'Pick a new icon' })}
                onPress={props.onPickIcon}
                sheen
                block
                testID="welcome-pick-icon"
              />
            ) : null}
            <Row justify="space-between" align="center">
              <Text
                variant="bodySm"
                color={theme.semantic.text.secondary}
                style={{ flex: 1 }}
                testID="welcome-renewal"
              >
                {props.renewal ?? ''}
              </Text>
              <TextLink
                label={t({ id: 'monetize.welcome.done', message: 'Done' })}
                onPress={props.onDone}
                testID="welcome-done"
              />
            </Row>
          </Stack>
        </View>
      </ScrollView>
    </Scaffold>
  );
}
