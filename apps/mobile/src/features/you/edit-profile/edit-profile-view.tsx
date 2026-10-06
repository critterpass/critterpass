/**
 * Edit profile (3n-3) as a pure view: back to the profile and SAVE, the avatar with CHANGE AVATAR,
 * the NAME, USERNAME, HOME AIRPORT and LANGUAGES rows (each opens its own sheet), and what crews
 * see. The app icon picker (3n-5) is reached from Settings.
 */
import { useLingui } from '@lingui/react/macro';
import { Fragment, type ReactNode } from 'react';
import { I18nManager, ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { LargeTitle } from '@/ui/shell/LargeTitle';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface EditField {
  readonly key: 'name' | 'username' | 'home-airport' | 'languages';
  readonly label: string;
  readonly value: string;
  /** A problem or a live answer under the value. */
  readonly note?: string | null;
  readonly onPress: () => void;
}

export interface EditProfileViewProps {
  readonly face: ReactNode;
  /** What the avatar is: the guide's name, "Photo", "Initials". */
  readonly avatarTitle: string;
  readonly avatarLine: string | null;
  readonly onChangeAvatar: () => void;
  readonly fields: readonly EditField[];
  readonly canSave: boolean;
  readonly saving: boolean;
  readonly problem: string | null;
  readonly onSave: () => void;
  readonly onBack: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['20'] },
  group: { backgroundColor: t.semantic.bg.raised, borderRadius: t.radius.lg, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    paddingHorizontal: t.size.cardInner.max,
    paddingVertical: t.space['12'],
  },
  body: { flex: 1, minWidth: 0, gap: t.space['2'] },
  divider: { height: 1, marginHorizontal: t.size.cardInner.max, backgroundColor: t.color.divider },
  identity: { flex: 1, minWidth: 0, gap: t.space['6'], alignItems: 'flex-start' },
}));

export function EditProfileView(props: EditProfileViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Scaffold variant="dark" edges={['top']} testID="you-edit">
      <LargeTitle
        title={t({ id: 'you.edit.title', message: 'Edit profile' })}
        start={
          <BackEyebrow
            label={t({ id: 'you.edit.back', message: 'Profile' })}
            onPress={props.onBack}
            testID="you-edit-back"
          />
        }
        end={
          <PillButton
            label={t({ id: 'you.edit.save', message: 'Save' })}
            size="sm"
            onPress={props.onSave}
            disabled={!props.canSave}
            loading={props.saving}
            testID="you-edit-save"
          />
        }
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Row gap="14">
          {props.face}
          <View style={styles.identity}>
            <Text variant="title">{props.avatarTitle}</Text>
            {props.avatarLine === null ? null : <SecondaryText>{props.avatarLine}</SecondaryText>}
            <PillButton
              label={t({ id: 'you.edit.changeAvatar', message: 'Change avatar' })}
              size="sm"
              variant="secondary"
              onPress={props.onChangeAvatar}
              testID="you-edit-change-avatar"
            />
          </View>
        </Row>
        <View style={styles.group}>
          {props.fields.map((field, index) => (
            <Fragment key={field.key}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <PressScale
                onPress={field.onPress}
                widthClass="wide"
                accessibilityRole="button"
                accessibilityLabel={[field.label, field.value, field.note]
                  .filter(Boolean)
                  .join(', ')}
                style={styles.row}
                testID={`you-edit-${field.key}`}
              >
                <Stack gap="2" style={styles.body}>
                  <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                    {field.label}
                  </Text>
                  <Text variant="rowTitle">{field.value}</Text>
                  {field.note ? <SecondaryText>{field.note}</SecondaryText> : null}
                </Stack>
                <SecondaryText variant="title" accessibilityElementsHidden>
                  {I18nManager.isRTL ? '‹' : '›'}
                </SecondaryText>
              </PressScale>
            </Fragment>
          ))}
        </View>
        {props.problem === null ? null : (
          <Text variant="bodySm" color={theme.semantic.state.urgent} testID="you-edit-problem">
            {props.problem}
          </Text>
        )}
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'you.edit.crewSees',
            message: 'Your crews see your name, avatar and home airport. Nothing else.',
          })}
        </Text>
      </ScrollView>
    </Scaffold>
  );
}
