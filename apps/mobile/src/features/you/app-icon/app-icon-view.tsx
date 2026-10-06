/**
 * The app icon picker (3n-5) as a pure view: the icon showing now on a home-screen stage, the
 * STYLE row, how the chosen icon looks in the phone's light, dark and tinted looks, and the
 * icons EARNED ON THE ROAD (locked ones dimmed under a question mark, with how to earn them
 * when tapped).
 */
import type { AppIconBaseId } from '@cp/domain';
import { upper } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { Image, ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { HeaderPill } from '@/ui/shell/HeaderPills';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { APP_ICON_PREVIEWS, type AppIconLook } from './app-icon-previews';
import { APP_ICON_CORNER, Tiles, useIconNames } from './app-icon-tiles';
import type { IconChoice, PickerModel } from './picker-model';

export type AppIconProblem = 'failed' | { readonly locked: AppIconBaseId } | null;

export interface AppIconViewProps {
  readonly model: PickerModel;
  /** The icon being switched to; its tile dims and nothing else can be chosen. */
  readonly switching: AppIconBaseId | null;
  readonly problem: AppIconProblem;
  readonly onChoose: (choice: IconChoice) => void;
  readonly onBack?: () => void;
}

const STAGE_ICON = 84;
const NEIGHBOUR = 56;
const LOOK = 40;
const CORNER = APP_ICON_CORNER;
const LOOKS: readonly AppIconLook[] = ['any', 'dark', 'tinted'];

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['16'] },
  stage: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    paddingVertical: t.space['20'],
    flexDirection: 'row',
    justifyContent: 'center',
    gap: t.space['24'],
  },
  stageApp: { alignItems: 'center', gap: t.space['8'] },
  /** The blank apps either side of ours on the home screen; level with the icon, not its name. */
  neighbour: {
    width: NEIGHBOUR,
    height: NEIGHBOUR,
    borderRadius: NEIGHBOUR * CORNER,
    marginTop: (STAGE_ICON - NEIGHBOUR) / 2,
    backgroundColor: t.semantic.bg.control,
  },
  stageIcon: { width: STAGE_ICON, height: STAGE_ICON, borderRadius: STAGE_ICON * CORNER },
  group: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.size.cardInner.max,
    gap: t.space['12'],
  },
  look: { width: LOOK, height: LOOK, borderRadius: LOOK * CORNER },
  lookCell: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: t.space['8'] },
}));

export function AppIconView({ model, switching, problem, onChoose, onBack }: AppIconViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const names = useIconNames();
  const styleCount = model.styles.length;
  const shown = model.current === null ? undefined : APP_ICON_PREVIEWS[model.current];
  const lookNames: Readonly<Record<AppIconLook, string>> = {
    any: t({ id: 'you.appIcon.light', message: 'Light' }),
    dark: t({ id: 'you.appIcon.dark', message: 'Dark' }),
    tinted: t({ id: 'you.appIcon.tinted', message: 'Tinted' }),
  };
  const earnedTotal = model.earned.length;
  const earnedUnlocked = model.earnedUnlocked;
  const lockedName = problem !== null && problem !== 'failed' ? (names[problem.locked] ?? '') : '';
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="you-app-icon">
      <ScrollView contentContainerStyle={styles.content}>
        <Row gap="12" justify="space-between" align="center">
          <BackEyebrow
            label={t({ id: 'you.appIcon.back', message: 'Settings' })}
            onPress={onBack}
            testID="you-app-icon-back"
          />
          <HeaderPill
            tone="private"
            label={upper(
              t({
                id: 'you.appIcon.counts',
                message: plural(styleCount, {
                  one: `# style · ${earnedUnlocked} earned`,
                  other: `# styles · ${earnedUnlocked} earned`,
                }),
              }),
              locale,
            )}
          />
        </Row>
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'you.appIcon.title', message: 'App icon' })}
        </Text>
        <View style={styles.stage}>
          <View style={styles.neighbour} />
          <View style={styles.stageApp}>
            {shown === undefined ? null : (
              <Image source={shown.any} style={styles.stageIcon} accessible={false} />
            )}
            <Text variant="bodySm">CritterPass</Text>
          </View>
          <View style={styles.neighbour} />
        </View>
        {problem === null ? null : (
          <Text variant="bodySm" color={theme.semantic.state.urgent} testID="you-app-icon-problem">
            {problem === 'failed'
              ? t({ id: 'you.appIcon.failed', message: 'The icon didn’t change. Try again.' })
              : t({
                  id: 'you.appIcon.lockedLine',
                  message: `${lockedName} is earned on a trip. It unlocks when you find it.`,
                })}
          </Text>
        )}

        <Row gap="12" justify="space-between">
          <Text variant="eyebrow">{t({ id: 'you.appIcon.style', message: 'Style' })}</Text>
          <Text variant="eyebrow" color={theme.semantic.text.secondary}>
            {t({ id: 'you.appIcon.styleNote', message: 'Same as the store icons' })}
          </Text>
        </Row>
        <Tiles choices={model.styles} switching={switching} onChoose={onChoose} />

        {shown === undefined ? null : (
          <View style={styles.group}>
            <Stack gap="2">
              <Text variant="rowTitle">
                {t({ id: 'you.appIcon.appearance', message: 'Appearance' })}
              </Text>
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {t({
                  id: 'you.appIcon.appearanceLine',
                  message: 'The icon follows your phone’s look.',
                })}
              </Text>
            </Stack>
            <Row gap="12">
              {LOOKS.map((look) => (
                <View key={look} style={styles.lookCell}>
                  <Image source={shown[look]} style={styles.look} accessible={false} />
                  <Text variant="caption" color={theme.semantic.text.secondary}>
                    {lookNames[look]}
                  </Text>
                </View>
              ))}
            </Row>
          </View>
        )}

        {earnedTotal === 0 ? null : (
          <>
            <Row gap="12" justify="space-between">
              <Text variant="eyebrow">
                {t({ id: 'you.appIcon.earnedTitle', message: 'Earned on the road' })}
              </Text>
              <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                {t({
                  id: 'you.appIcon.earnedCount',
                  message: `${earnedUnlocked} of ${earnedTotal}`,
                })}
              </Text>
            </Row>
            <Tiles choices={model.earned} switching={switching} onChoose={onChoose} compact />
          </>
        )}
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'you.appIcon.footer',
            message: 'Critter icons are earned by being there, and none of them can be bought.',
          })}
        </Text>
      </ScrollView>
    </Scaffold>
  );
}
