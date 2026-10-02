/**
 * Settings › Language (the APP LANGUAGE part of 3n-8): every language the app ships, each in its
 * own script. Picking one switches the whole app in place, with no restart and no navigation.
 */
import { useLingui } from '@lingui/react/macro';
import { Fragment } from 'react';
import { ScrollView, View } from 'react-native';

import { LanguageRow } from '@/ui/inputs/LanguageRow';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { LanguageChoice } from './language-names';

export interface LanguageViewProps {
  readonly choices: readonly LanguageChoice[];
  readonly current: string;
  /** A language whose switch is still loading its words. */
  readonly switching: string | null;
  readonly onPick: (code: string) => void;
  readonly onBack?: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['16'] },
  group: { backgroundColor: t.semantic.bg.raised, borderRadius: t.radius.lg, overflow: 'hidden' },
  divider: { height: 1, marginHorizontal: t.size.cardInner.max, backgroundColor: t.color.divider },
}));

export function LanguageView(props: LanguageViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Scaffold variant="dark" edges={['top']} testID="you-language">
      <ScrollView contentContainerStyle={styles.content}>
        <BackEyebrow
          label={t({ id: 'you.language.back', message: 'Settings' })}
          onPress={props.onBack}
          testID="you-language-back"
        />
        <Text variant="h1" accessibilityRole="header" testID="you-language-title">
          {t({ id: 'you.language.title', message: 'Language' })}
        </Text>
        <Stack gap="8">
          <Text variant="eyebrow" accessibilityRole="header">
            {t({ id: 'you.language.appLanguage', message: 'App language' })}
          </Text>
          <View style={styles.group} accessibilityRole="radiogroup">
            {props.choices.map((choice, index) => (
              <Fragment key={choice.code}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <LanguageRow
                  locale={choice.code}
                  nativeName={choice.nativeName}
                  localName={choice.localName}
                  selected={(props.switching ?? props.current) === choice.code}
                  onSelect={() => props.onPick(choice.code)}
                  testID={`you-language-${choice.code}`}
                />
              </Fragment>
            ))}
          </View>
        </Stack>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'you.language.note',
            message:
              'The app, your guide’s replies and your notifications switch together. Places keep their local names.',
          })}
        </Text>
      </ScrollView>
    </Scaffold>
  );
}
