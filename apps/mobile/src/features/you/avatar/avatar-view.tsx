/**
 * The avatar picker (3n-4) as a pure view: the face being picked, big, with how the crew sees it
 * (a chat line and the map pill), the INITIALS / CRITTER / PHOTO tabs, and DONE. The CRITTER tab
 * holds the six guides; forms from the Critterdex join once the critters area offers their art.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { AvatarPicker } from '@/ui/avatar/AvatarPicker';
import type { GuideAvatarId } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Segmented } from '@/ui/inputs/Segmented';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { FaceProps } from './member-faces';

export type AvatarTab = 'initials' | 'critter' | 'photo';

export interface AvatarViewProps {
  readonly name: string;
  /** The big preview of the face being picked. */
  readonly preview: ReactNode;
  /** The same face as an `Avatar` draws it in chat and on the map. */
  readonly face: FaceProps;
  readonly tab: AvatarTab;
  readonly onTab: (tab: AvatarTab) => void;
  readonly guide: GuideAvatarId | null;
  readonly onGuide: (guide: GuideAvatarId) => void;
  /** Null when this build has no photo picker. */
  readonly onPhoto: (() => void) | null;
  /** The photo waits for its check before crewmates see it. */
  readonly photoPending: boolean;
  readonly canDone: boolean;
  readonly onDone: () => void;
  readonly onBack: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['20'] },
  bubble: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space['12'],
    paddingVertical: t.space['8'],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['6'],
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: t.color.blue,
    paddingEnd: t.space['12'],
    padding: t.space['2'],
  },
  crew: { flex: 1, minWidth: 0, gap: t.space['8'] },
}));

export function AvatarView(props: AvatarViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="you-avatar">
      <ScrollView contentContainerStyle={styles.content}>
        <Row justify="space-between">
          <BackEyebrow
            label={t({ id: 'you.avatar.back', message: 'Edit profile' })}
            onPress={props.onBack}
            testID="you-avatar-back"
          />
          <PillButton
            label={t({ id: 'you.avatar.done', message: 'Done' })}
            size="sm"
            disabled={!props.canDone}
            onPress={props.onDone}
            testID="you-avatar-done"
          />
        </Row>
        <Row gap="14" align="center">
          {props.preview}
          <View style={styles.crew}>
            <Text variant="eyebrow" color={theme.semantic.text.secondary}>
              {t({ id: 'you.avatar.crewSees', message: 'How the crew sees it' })}
            </Text>
            <Row gap="6" align="center">
              <Avatar name={props.name} size="sm" decorative {...props.face} />
              <View style={styles.bubble}>
                <Text variant="bodySm">
                  {t({ id: 'you.avatar.sampleLine', message: 'on my way!' })}
                </Text>
              </View>
            </Row>
            <View style={styles.pill}>
              <Avatar name={props.name} size="sm" decorative cutout={false} {...props.face} />
              <Text variant="label">{upper(props.name, locale)}</Text>
            </View>
          </View>
        </Row>
        <Segmented
          segments={[
            { value: 'initials', label: t({ id: 'you.avatar.tab.initials', message: 'Initials' }) },
            { value: 'critter', label: t({ id: 'you.avatar.tab.critter', message: 'Critter' }) },
            { value: 'photo', label: t({ id: 'you.avatar.tab.photo', message: 'Photo' }) },
          ]}
          value={props.tab}
          onChange={props.onTab}
          label={t({ id: 'you.avatar.tabs', message: 'Avatar' })}
          testID="you-avatar-tabs"
        />
        {props.tab === 'critter' ? (
          <Stack gap="12">
            <Text variant="eyebrow" accessibilityRole="header">
              {t({ id: 'you.avatar.guides', message: 'Your guides' })}
            </Text>
            <AvatarPicker selected={props.guide} onPick={props.onGuide} testID="you-avatar-guide" />
          </Stack>
        ) : null}
        {props.tab === 'initials' ? (
          <Text variant="body" color={theme.semantic.text.secondary} testID="you-avatar-initials">
            {t({
              id: 'you.avatar.initialsLine',
              message: 'Your first letter in your crew colour. Each crew keeps its own colour.',
            })}
          </Text>
        ) : null}
        {props.tab === 'photo' ? (
          <Stack gap="12">
            <Text variant="body" color={theme.semantic.text.secondary}>
              {props.photoPending
                ? t({
                    id: 'you.avatar.photoPending',
                    message: 'Until it’s checked, your crews see your initials.',
                  })
                : t({
                    id: 'you.avatar.photoLine',
                    message: 'Photos only show inside your crews.',
                  })}
            </Text>
            {props.onPhoto === null ? null : (
              <PillButton
                label={t({ id: 'you.avatar.usePhoto', message: 'Use a real photo' })}
                variant="secondary"
                onPress={props.onPhoto}
                testID="you-avatar-photo"
              />
            )}
          </Stack>
        ) : null}
      </ScrollView>
    </Scaffold>
  );
}
