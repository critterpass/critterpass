/**
 * The app icon picker (3n-5) as a pure view: the icon showing now on a home-screen stage, the
 * STYLE row, the icons EARNED ON THE ROAD (locked ones dimmed, with how to earn them when
 * tapped), and how the chosen icon looks in the phone's light, dark and tinted looks.
 */
import type { AppIconBaseId } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Image, ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { APP_ICON_PREVIEWS, type AppIconLook } from './app-icon-previews';
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
const TILE = 68;
const LOOK = 40;
/** iOS rounds icons to about this share of their width. */
const CORNER = 0.225;
const LOOKS: readonly AppIconLook[] = ['any', 'dark', 'tinted'];

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['16'] },
  stage: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    paddingVertical: t.space['20'],
    alignItems: 'center',
    gap: t.space['8'],
  },
  stageIcon: { width: STAGE_ICON, height: STAGE_ICON, borderRadius: STAGE_ICON * CORNER },
  tiles: { flexWrap: 'wrap', gap: t.space['12'] },
  tile: { width: TILE + 14, alignItems: 'center', gap: t.space['4'] },
  ring: { padding: 3, borderRadius: TILE * CORNER + 5, borderWidth: 2, borderColor: 'transparent' },
  icon: { width: TILE, height: TILE, borderRadius: TILE * CORNER },
  group: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.size.cardInner.max,
    gap: t.space['12'],
  },
  look: { width: LOOK, height: LOOK, borderRadius: LOOK * CORNER },
  lookCell: { flex: 1, minWidth: 0, alignItems: 'center', gap: t.space['8'] },
}));

function useIconNames(): Readonly<Partial<Record<AppIconBaseId, string>>> {
  const { t } = useLingui();
  return {
    face: t({ id: 'you.appIcon.face', message: 'Face' }),
    passport: t({ id: 'you.appIcon.passport', message: 'Passport' }),
    temple: t({ id: 'you.appIcon.temple', message: 'Temple' }),
    sardi: t({ id: 'you.appIcon.sardi', message: 'Sardi' }),
    pon: t({ id: 'you.appIcon.pon', message: 'Pon' }),
  };
}

function Tiles(props: {
  readonly choices: readonly IconChoice[];
  readonly switching: AppIconBaseId | null;
  readonly onChoose: (choice: IconChoice) => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const names = useIconNames();
  return (
    <Row style={styles.tiles}>
      {props.choices.map((choice) => {
        const preview = APP_ICON_PREVIEWS[choice.id];
        if (preview === undefined) return null;
        const name = names[choice.id] ?? choice.id;
        const inUse = choice.state === 'in_use';
        const locked = choice.state === 'locked';
        const line = inUse
          ? t({ id: 'you.appIcon.inUse', message: 'In use' })
          : locked
            ? t({ id: 'you.appIcon.locked', message: 'Locked' })
            : choice.isNew
              ? t({ id: 'you.appIcon.new', message: 'New' })
              : choice.gate === 'earned'
                ? t({ id: 'you.appIcon.earned', message: 'Earned' })
                : t({ id: 'you.appIcon.free', message: 'Free' });
        const opacity = locked ? 0.3 : props.switching === choice.id ? 0.6 : 1;
        return (
          <PressScale
            key={choice.id}
            onPress={() => props.onChoose(choice)}
            disabled={props.switching !== null}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${line}`}
            accessibilityState={{ selected: inUse, busy: props.switching === choice.id }}
            style={styles.tile}
            testID={`you-app-icon-${choice.id}`}
          >
            <View
              style={[styles.ring, inUse ? { borderColor: theme.semantic.action.primary } : null]}
            >
              <Image source={preview.any} style={[styles.icon, { opacity }]} accessible={false} />
            </View>
            <Text variant="eyebrow" numberOfLines={1}>
              {upper(name, locale)}
            </Text>
            <Text
              variant="caption"
              color={
                inUse || choice.isNew
                  ? theme.semantic.action.primary
                  : theme.semantic.text.secondary
              }
            >
              {line}
            </Text>
          </PressScale>
        );
      })}
    </Row>
  );
}

export function AppIconView({ model, switching, problem, onChoose, onBack }: AppIconViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const names = useIconNames();
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
        <BackEyebrow
          label={t({ id: 'you.appIcon.back', message: 'Settings' })}
          onPress={onBack}
          testID="you-app-icon-back"
        />
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'you.appIcon.title', message: 'App icon' })}
        </Text>
        <View style={styles.stage}>
          {shown === undefined ? null : (
            <Image source={shown.any} style={styles.stageIcon} accessible={false} />
          )}
          <Text variant="bodySm">CritterPass</Text>
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

        <Text variant="eyebrow">{t({ id: 'you.appIcon.style', message: 'Style' })}</Text>
        <Tiles choices={model.styles} switching={switching} onChoose={onChoose} />

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
            <Tiles choices={model.earned} switching={switching} onChoose={onChoose} />
          </>
        )}

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
