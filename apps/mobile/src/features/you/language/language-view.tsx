/**
 * Settings › Language (the APP LANGUAGE part of 3n-8): four languages first (the current one, the
 * phone's own, English), each in its own script, then "N more" opens the rest in place. Picking
 * one switches the whole app in place, with no restart and no navigation.
 */
import { useLingui } from '@lingui/react/macro';
import { Fragment, type ReactNode } from 'react';
import { I18nManager, ScrollView, View } from 'react-native';

import { SecondaryText } from '@/ui/cards/SecondaryText';
import { LanguageRow } from '@/ui/inputs/LanguageRow';
import { PressScale } from '@/ui/press/PressScale';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { LanguageChoice } from './language-names';

export interface LanguageViewProps {
  readonly featured: readonly LanguageChoice[];
  readonly more: readonly LanguageChoice[];
  /** The rest of the list is open. */
  readonly showMore: boolean;
  readonly onShowMore: () => void;
  readonly current: string;
  /** A language whose switch is still loading its words. */
  readonly switching: string | null;
  readonly onPick: (code: string) => void;
  readonly onBack?: () => void;
  /** The CURRENCY section, under the languages. */
  readonly children?: ReactNode;
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['16'] },
  group: { backgroundColor: t.semantic.bg.raised, borderRadius: t.radius.lg, overflow: 'hidden' },
  divider: { height: 1, marginHorizontal: t.size.cardInner.max, backgroundColor: t.color.divider },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.size.cardInner.max,
    paddingVertical: t.space['14'],
  },
  moreTitle: { flex: 1 },
}));

export function LanguageView(props: LanguageViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const count = props.more.length;
  const moreLabel = t({ id: 'you.language.more', message: `${count} more` });
  return (
    <Scaffold variant="dark" edges={['top']} testID="you-language">
      <ScrollView contentContainerStyle={styles.content}>
        <BackEyebrow
          label={t({ id: 'you.language.back', message: 'Settings' })}
          onPress={props.onBack}
          testID="you-language-back"
        />
        <Text variant="h1" accessibilityRole="header" testID="you-language-title">
          {t({ id: 'you.language.titleCurrency', message: 'Language and currency' })}
        </Text>
        <Stack gap="8">
          <Text variant="eyebrow" accessibilityRole="header">
            {t({ id: 'you.language.appLanguage', message: 'App language' })}
          </Text>
          <View style={styles.group} accessibilityRole="radiogroup">
            {(props.showMore ? [...props.featured, ...props.more] : props.featured).map(
              (choice, index) => (
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
              ),
            )}
            {props.showMore || props.more.length === 0 ? null : (
              <>
                <View style={styles.divider} />
                <PressScale
                  onPress={props.onShowMore}
                  widthClass="wide"
                  accessibilityRole="button"
                  accessibilityLabel={moreLabel}
                  style={styles.more}
                  testID="you-language-more"
                >
                  <Text variant="rowTitle" style={styles.moreTitle}>
                    {moreLabel}
                  </Text>
                  <SecondaryText variant="title" accessibilityElementsHidden>
                    {I18nManager.isRTL ? '‹' : '›'}
                  </SecondaryText>
                </PressScale>
              </>
            )}
          </View>
        </Stack>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'you.language.note',
            message:
              'The app, your guide’s replies and your notifications switch together. Places keep their local names.',
          })}
        </Text>
        {props.children}
      </ScrollView>
    </Scaffold>
  );
}
