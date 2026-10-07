/**
 * A row of app icons to choose from: each icon over its name, the one in use ringed. The style
 * row adds a line under the name (free, in use); the earned row is smaller, names only, with
 * locked icons dimmed behind a question mark.
 */
import type { AppIconBaseId } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Image, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Row } from '@/ui/layout/Row';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { APP_ICON_PREVIEWS } from './app-icon-previews';
import type { IconChoice } from './picker-model';

const TILE = 68;
const EARNED_TILE = 46;
const EARNED_NAME_MIN_SIZE = 7;
/** iOS rounds icons to about this share of their width. */
export const APP_ICON_CORNER = 0.225;
const CORNER = APP_ICON_CORNER;

const useStyles = makeStyles((t) => ({
  tiles: { flexWrap: 'wrap', gap: t.space['12'] },
  tile: { width: TILE + 14, alignItems: 'center', gap: t.space['4'] },
  ring: { padding: 3, borderRadius: TILE * CORNER + 5, borderWidth: 2, borderColor: 'transparent' },
  icon: { width: TILE, height: TILE, borderRadius: TILE * CORNER },
  earnedTiles: { flexWrap: 'wrap', gap: t.space['8'] },
  earnedTile: { width: EARNED_TILE + 8, alignItems: 'center', gap: t.space['4'] },
  earnedIcon: { width: EARNED_TILE, height: EARNED_TILE, borderRadius: EARNED_TILE * CORNER },
  unknown: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export function useIconNames(): Readonly<Partial<Record<AppIconBaseId, string>>> {
  const { t } = useLingui();
  return {
    face: t({ id: 'you.appIcon.face', message: 'Face' }),
    passport: t({ id: 'you.appIcon.passport', message: 'Passport' }),
    temple: t({ id: 'you.appIcon.temple', message: 'Temple' }),
    sardi: t({ id: 'you.appIcon.sardi', message: 'Sardi' }),
    pon: t({ id: 'you.appIcon.pon', message: 'Pon' }),
  };
}

export function Tiles(props: {
  readonly choices: readonly IconChoice[];
  readonly switching: AppIconBaseId | null;
  readonly onChoose: (choice: IconChoice) => void;
  /** The earned row: smaller icons under their name alone, locked ones behind a question mark. */
  readonly compact?: boolean;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const names = useIconNames();
  return (
    <Row style={props.compact === true ? styles.earnedTiles : styles.tiles}>
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
                : choice.gate === 'pass_plus'
                  ? t({ id: 'you.appIcon.passPlus', message: 'Pass+' })
                  : t({ id: 'you.appIcon.free', message: 'Free' });
        const compact = props.compact === true;
        const opacity = locked ? 0.3 : props.switching === choice.id ? 0.6 : 1;
        return (
          <PressScale
            key={choice.id}
            onPress={() => props.onChoose(choice)}
            disabled={props.switching !== null}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${line}`}
            accessibilityState={{ selected: inUse, busy: props.switching === choice.id }}
            style={compact ? styles.earnedTile : styles.tile}
            testID={`you-app-icon-${choice.id}`}
          >
            <View
              style={[styles.ring, inUse ? { borderColor: theme.semantic.action.primary } : null]}
            >
              <Image
                source={preview.any}
                style={[compact ? styles.earnedIcon : styles.icon, { opacity }]}
                accessible={false}
              />
              {compact && locked ? (
                <View style={styles.unknown} accessible={false}>
                  <Text variant="rowTitle">?</Text>
                </View>
              ) : null}
            </View>
            <Text
              variant="eyebrow"
              numberOfLines={1}
              // The earned row is six narrow columns (3n-5): a name shrinks to its column, never cut.
              autoFit={compact}
              autoFitMinSize={compact ? EARNED_NAME_MIN_SIZE : undefined}
              color={locked ? theme.semantic.text.secondary : theme.semantic.text.primary}
            >
              {upper(name, locale)}
            </Text>
            {compact && !inUse && !choice.isNew ? null : (
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
            )}
          </PressScale>
        );
      })}
    </Row>
  );
}
