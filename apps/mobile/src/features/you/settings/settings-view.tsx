/**
 * Settings (3n-2, and 3n-6 once scrolled) as a pure view: a large title that collapses into the
 * bar (with the plan chip once the plan screen exists), the sections it is given, another area's
 * section after APP (the permissions), and Tokek over the version line. Tapping Tokek five
 * times plays his theme. A section with no rows is not drawn.
 */
import { useLingui } from '@lingui/react/macro';
import { Fragment, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { SettingsGroup, type SettingsRow } from '@/ui/inputs/SettingsGroup';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { HeaderPill } from '@/ui/shell/HeaderPills';
import { LargeTitle, useLargeTitleCollapse } from '@/ui/shell/LargeTitle';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { TokekFooter } from './tokek-footer';

export interface SettingsSection {
  readonly id: string;
  readonly title: string;
  readonly rows: readonly SettingsRow[];
}

export interface SettingsViewProps {
  readonly sections: readonly SettingsSection[];
  /** Sections another area draws itself (permissions), placed after APP. */
  readonly children?: ReactNode;
  /** "CRITTERPASS 1.0 (214)" */
  readonly version: string;
  /** "PASS+ · YEARLY ›": the plan the account is on, opening the plan screen. */
  readonly plan?: { readonly label: string; readonly onPress: () => void };
  /** Five taps on Tokek. */
  readonly onTokek?: () => void;
  readonly onBack?: () => void;
}

/** The section the permissions follow: after the app's own settings, before the account. */
const CHILDREN_AFTER = 'app';

const useStyles = makeStyles((t) => ({
  content: {
    paddingHorizontal: t.size.gutter,
    paddingBottom: t.space['32'],
    gap: t.space['20'],
  },
  footer: { alignItems: 'center', paddingTop: t.space['12'], gap: t.space['8'] },
}));

export function SettingsView(props: SettingsViewProps) {
  const { sections, children, version, plan, onBack } = props;
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const { collapse, collapsed, onScroll } = useLargeTitleCollapse();
  const drawn = sections.filter((section) => section.rows.length > 0);
  const anchor = drawn.some((section) => section.id === CHILDREN_AFTER);
  return (
    <Scaffold variant="dark" edges={['top']} testID="you-settings">
      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingBottom: theme.space['32'] }}
      >
        <View style={{ backgroundColor: theme.semantic.bg.base }}>
          <LargeTitle
            title={t({ id: 'you.settings.title', message: 'Settings' })}
            collapse={collapse}
            collapsed={collapsed}
            start={
              <BackEyebrow
                label={t({ id: 'you.settings.back', message: 'Profile' })}
                onPress={onBack}
                testID="you-settings-back"
              />
            }
            {...(plan === undefined
              ? {}
              : {
                  end: (
                    <HeaderPill
                      label={plan.label}
                      onPress={plan.onPress}
                      testID="you-settings-plan"
                    />
                  ),
                })}
          />
        </View>
        <View style={styles.content}>
          {drawn.map((section) => (
            <Fragment key={section.id}>
              <SettingsGroup
                title={section.title}
                rows={section.rows}
                testID={`you-settings-${section.id}`}
              />
              {section.id === CHILDREN_AFTER ? children : null}
            </Fragment>
          ))}
          {anchor ? null : children}
          <View style={styles.footer}>
            <TokekFooter {...(props.onTokek ? { onFiveTaps: props.onTokek } : {})} />
            <Text
              variant="monoData"
              color={theme.semantic.text.secondary}
              testID="you-settings-version"
            >
              {version}
            </Text>
          </View>
        </View>
      </ScrollView>
    </Scaffold>
  );
}
