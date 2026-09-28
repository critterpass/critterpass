/**
 * The frame every data page of the pass shares (3a-2 … 3a-5): "PAGE n OF 4" with its progress
 * pills, the page's content, and the bottom call to action above the home indicator.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { upper } from '@cp/i18n';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { PAGE_COUNT } from './flow-controller/steps';

const useStyles = makeStyles((th) => ({
  root: { flex: 1 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: th.space['20'],
    paddingTop: th.space['8'],
  },
  dots: { flexDirection: 'row', gap: th.space['6'], alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
  content: { paddingHorizontal: th.space['20'], paddingTop: th.space['12'], gap: th.space['16'] },
  footer: { paddingHorizontal: th.space['20'], paddingBottom: th.space['8'], gap: th.space['12'] },
}));

export function PageDots({ page }: { readonly page: number }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.dots} accessible={false} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: PAGE_COUNT }, (_, index) => (
        <View
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a React key.
          key={`page-${String(index)}`}
          style={[
            styles.dot,
            index < page
              ? { width: 18, backgroundColor: theme.color.yellow }
              : { width: 8, backgroundColor: theme.semantic.bg.raised },
          ]}
        />
      ))}
    </View>
  );
}

export interface OnboardingPageProps {
  readonly page: number;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** Right side of the top row in place of the page pills (the quiz's "3 OF 6"). */
  readonly topEnd?: ReactNode;
  readonly scroll?: boolean;
  readonly testID?: string;
}

export function OnboardingPage({
  page,
  children,
  footer,
  topEnd,
  scroll = true,
  testID,
}: OnboardingPageProps) {
  const styles = useStyles();
  const locale = useLocale();
  const theme = useTheme();
  const pageLabel = t({ id: 'onboarding.page', message: `Page ${page} of ${PAGE_COUNT}` });
  const body = <View style={styles.content}>{children}</View>;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} {...(testID ? { testID } : {})}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.top}>
          <Text variant="eyebrow" color={theme.semantic.text.secondary}>
            {upper(pageLabel, locale)}
          </Text>
          {topEnd ?? <PageDots page={page} />}
        </View>
        {scroll ? (
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.root}>
            {body}
          </ScrollView>
        ) : (
          <View style={styles.root}>{body}</View>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </Scaffold>
  );
}
