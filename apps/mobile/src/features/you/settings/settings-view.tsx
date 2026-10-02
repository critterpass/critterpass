/**
 * Settings (3n-2, and 3n-6 once scrolled) as a pure view: a large title that collapses into the
 * bar, the sections it is given, and the version footer. The screen decides which sections exist;
 * a section with no rows is not drawn.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { SettingsGroup, type SettingsRow } from '@/ui/inputs/SettingsGroup';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { LargeTitle, useLargeTitleCollapse } from '@/ui/shell/LargeTitle';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface SettingsSection {
  readonly id: string;
  readonly title: string;
  readonly rows: readonly SettingsRow[];
}

export interface SettingsViewProps {
  readonly sections: readonly SettingsSection[];
  /** Sections another area draws itself (permissions), placed after the rows above. */
  readonly children?: ReactNode;
  /** "CRITTERPASS 1.0 (214)" */
  readonly version: string;
  readonly onBack?: () => void;
}

const useStyles = makeStyles((t) => ({
  content: {
    paddingHorizontal: t.size.gutter,
    paddingBottom: t.space['32'],
    gap: t.space['20'],
  },
  footer: { alignItems: 'center', paddingTop: t.space['12'] },
}));

export function SettingsView({ sections, children, version, onBack }: SettingsViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const { collapse, collapsed, onScroll } = useLargeTitleCollapse();
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
          />
        </View>
        <View style={styles.content}>
          {sections
            .filter((section) => section.rows.length > 0)
            .map((section) => (
              <SettingsGroup
                key={section.id}
                title={section.title}
                rows={section.rows}
                testID={`you-settings-${section.id}`}
              />
            ))}
          {children}
          <View style={styles.footer}>
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
