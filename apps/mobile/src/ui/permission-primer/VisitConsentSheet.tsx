import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { useVisitConsentEntry } from '@/lib/location';

import { InlineAction } from '../buttons/InlineAction';
import { PillButton } from '../buttons/PillButton';
import { Icon } from '../icons/Icon';
import { SettingsGroup } from '../inputs/SettingsGroup';
import { Sheet } from '../sheet/Sheet';
import { Text } from '../text/Text';
import { useTheme } from '../theme';
import { CritterPingDemo } from './demos';

/* eslint-disable lingui/no-unlocalized-strings -- settings row keys, not copy */
const ROW_KEYS = { toggle: 'visit_detection', list: 'visit_list' } as const;
/* eslint-enable lingui/no-unlocalized-strings */

function consentTitle(): string {
  return t({ id: 'permissions.visits.title', message: 'Remember places you visit' });
}

function consentBody(): string {
  return t({
    id: 'permissions.visits.body',
    message:
      'Places you checked in at, never a trail of coordinates. They power quests, awards and your trip rating, and are deleted 30 days after the trip ends.',
  });
}

export interface VisitConsentSheetProps {
  readonly onAnswer: (granted: boolean) => void;
}

/**
 * The visit detection consent: what is kept (the places, not the path), what for, and for
 * how long. Nothing is detected until the user turns it on here or in Settings.
 */
export function VisitConsentSheet({ onAnswer }: VisitConsentSheetProps) {
  const theme = useTheme();
  return (
    <Sheet
      detents={['fit']}
      onDismiss={() => onAnswer(false)}
      accessibilityLabel={consentTitle()}
      testID="visit-consent-sheet"
    >
      <View style={styles.content}>
        <CritterPingDemo />
        <Text variant="h2" accessibilityRole="header">
          {consentTitle()}
        </Text>
        <Text variant="body">{consentBody()}</Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'permissions.visits.control',
            message: 'Turn it off any time in Settings. Visits already saved stay deletable.',
          })}
        </Text>
        <PillButton
          label={t({ id: 'permissions.visits.accept', message: 'Turn on' })}
          onPress={() => onAnswer(true)}
          block
          testID="visit-consent-accept"
        />
        <InlineAction
          label={t({ id: 'permissions.sheet.notNow', message: 'Not now' })}
          onPress={() => onAnswer(false)}
          testID="visit-consent-decline"
        />
      </View>
    </Sheet>
  );
}

export interface VisitDetectionSettingsProps {
  readonly granted: boolean;
  readonly onChange: (granted: boolean) => void;
  /** Opens the list of saved visits (to delete some). */
  readonly onManage?: () => void;
}

/** The Settings privacy row for visit detection (and the way to the saved visits). */
export function VisitDetectionSettings({
  granted,
  onChange,
  onManage,
}: VisitDetectionSettingsProps) {
  return (
    <SettingsGroup
      title={t({ id: 'permissions.visits.section', message: 'Places' })}
      testID="visit-detection-settings"
      rows={[
        {
          key: ROW_KEYS.toggle,
          kind: 'toggle',
          title: consentTitle(),
          subtitle: t({
            id: 'permissions.visits.subtitle',
            message: 'Places you checked in at, never a trail of coordinates.',
          }),
          value: granted,
          onChange,
        },
        ...(onManage
          ? [
              {
                key: ROW_KEYS.list,
                kind: 'value' as const,
                title: t({ id: 'permissions.visits.manage', message: 'Saved visits' }),
                value: '',
                onPress: onManage,
              },
            ]
          : []),
      ]}
    />
  );
}

/** The row itself: what is not happening, and the one action that brings the sheet back. */
export function VisitConsentRowView({ onPress }: { readonly onPress: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.row} testID="visit-consent-row">
      <Icon name="pin" size={18} decorative />
      <Text variant="caption" color={theme.semantic.text.secondary} style={styles.rowLine}>
        {t({
          id: 'permissions.visits.row',
          message: 'Places you visit on this trip are not remembered yet.',
        })}
      </Text>
      <InlineAction
        label={t({ id: 'permissions.visits.accept', message: 'Turn on' })}
        onPress={onPress}
        testID="visit-consent-row-action"
      />
    </View>
  );
}

/**
 * For a trip screen, after "Not now": one quiet line that brings the consent sheet back. Renders
 * nothing unless it is a trip day and the traveller has not decided.
 */
export function VisitConsentRow() {
  const { offered, open } = useVisitConsentEntry();
  return offered ? <VisitConsentRowView onPress={open} /> : null;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  rowLine: { flex: 1 },

  content: { paddingHorizontal: 20, paddingBottom: 12, gap: 14, alignItems: 'center' },
});
