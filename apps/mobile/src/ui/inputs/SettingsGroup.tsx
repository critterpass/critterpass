import { t } from '@lingui/core/macro';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { I18nManager, View } from 'react-native';

import { SecondaryText } from '../cards/SecondaryText';
import { Icon } from '../icons/Icon';
import type { DoodleName } from '../icons/generated';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';
import { Toggle } from './Toggle';

/** A coloured icon tile before a row's title (3n-6 HELP AND FEEDBACK). */
export interface SettingsLeading {
  readonly icon: DoodleName;
  readonly tint: 'pink' | 'yellow' | 'blue' | 'green';
}

interface RowBase {
  readonly key: string;
  readonly leading?: SettingsLeading;
  /** A leading tile the caller draws itself (Pings' art tiles); shown in place of `leading`. */
  readonly leadingNode?: ReactNode;
  /** The row's own id; a toggle row's switch gets `{testID}-toggle`. */
  readonly testID?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly disabled?: boolean;
}

export type SettingsRow =
  | (RowBase & {
      readonly kind: 'value';
      readonly value: string;
      readonly onPress: () => void;
      /** Drawn in place of the value and chevron (Rate's star). */
      readonly valueIcon?: DoodleName;
    })
  | (RowBase & {
      readonly kind: 'toggle';
      readonly value: boolean;
      readonly onChange: (next: boolean) => void;
    })
  | (RowBase & { readonly kind: 'check'; readonly checked: boolean; readonly onPress?: () => void })
  | (RowBase & { readonly kind: 'private'; readonly onPress?: () => void })
  | (RowBase & { readonly kind: 'destructive'; readonly onPress: () => void })
  | (RowBase & { readonly kind: 'custom'; readonly trailing: ReactNode });

export interface SettingsGroupProps {
  /** Section eyebrow ("Notifications"). */
  readonly title?: string;
  readonly rows: readonly SettingsRow[];
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  group: { backgroundColor: t.semantic.bg.raised, borderRadius: t.radius.lg, overflow: 'hidden' },
  row: {
    minHeight: MIN_TOUCH_TARGET + t.space['12'],
    paddingHorizontal: t.size.cardInner.max,
    paddingVertical: t.space['10'],
    alignItems: 'center',
  },
  divider: {
    height: 1,
    marginHorizontal: t.size.cardInner.max,
    backgroundColor: t.color.divider,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.semantic.state.success,
  },
  leading: {
    width: 36,
    height: 36,
    borderRadius: t.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

function LeadingTile({ leading, rowKey }: { leading: SettingsLeading; rowKey: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const tint = leading.tint === 'green' ? theme.color.green.base : theme.color[leading.tint];
  return (
    <View style={[styles.leading, { backgroundColor: tint }]} testID={`settings-leading-${rowKey}`}>
      <Icon name={leading.icon} size={20} color={theme.semantic.text.onAccent} decorative />
    </View>
  );
}

function Titles({
  title,
  subtitle,
  colour,
}: {
  title: string;
  subtitle?: string;
  colour?: string;
}) {
  return (
    <Stack gap="2" flex={1}>
      <Text variant="rowTitle" color={colour}>
        {title}
      </Text>
      {subtitle ? <SecondaryText>{subtitle}</SecondaryText> : null}
    </Stack>
  );
}

function SettingsRowView({ row }: { readonly row: SettingsRow }) {
  const styles = useStyles();
  const theme = useTheme();
  const leading =
    row.leadingNode ??
    (row.leading ? <LeadingTile leading={row.leading} rowKey={row.key} /> : null);
  const chevron = I18nManager.isRTL ? '‹' : '›';
  const dim = row.disabled ? { opacity: 0.4 } : null;
  const described = (extra?: string) => [row.title, row.subtitle, extra].filter(Boolean).join(', ');
  switch (row.kind) {
    case 'toggle':
      return (
        <Row gap="12" style={[styles.row, dim]} testID={row.testID}>
          {leading}
          <Titles title={row.title} {...(row.subtitle ? { subtitle: row.subtitle } : {})} />
          <Toggle
            value={row.value}
            onValueChange={row.onChange}
            label={described()}
            {...(row.disabled ? { disabled: true } : {})}
            {...(row.testID === undefined ? {} : { testID: `${row.testID}-toggle` })}
          />
        </Row>
      );
    case 'custom':
      return (
        <Row gap="12" style={[styles.row, dim]} testID={row.testID}>
          {leading}
          <Titles title={row.title} {...(row.subtitle ? { subtitle: row.subtitle } : {})} />
          {row.trailing}
        </Row>
      );
    case 'value':
    case 'check':
    case 'private':
    case 'destructive': {
      const privateWord = t({ id: 'common.settings.private', message: 'Private' });
      const label =
        row.kind === 'value'
          ? described(row.value)
          : row.kind === 'private'
            ? described(privateWord)
            : described();
      const trailing =
        row.kind === 'value' && row.valueIcon !== undefined ? (
          <Icon name={row.valueIcon} size={20} color={theme.color.yellow} decorative />
        ) : row.kind === 'value' ? (
          <Text variant="rowTitle" color={theme.semantic.action.primary}>
            {`${row.value} ${chevron}`}
          </Text>
        ) : row.kind === 'check' ? (
          row.checked ? (
            <View style={styles.check}>
              <Icon name="check" size={14} color={theme.semantic.text.onAccent} decorative />
            </View>
          ) : null
        ) : row.kind === 'private' ? (
          <Row gap="6" align="center">
            <Icon name="lock" size={16} color={theme.semantic.state.success} decorative />
            <Text variant="rowTitle" color={theme.semantic.state.success}>
              {privateWord}
            </Text>
          </Row>
        ) : null;
      const content = (
        <>
          {leading}
          <Titles
            title={row.title}
            {...(row.subtitle ? { subtitle: row.subtitle } : {})}
            {...(row.kind === 'destructive' ? { colour: theme.semantic.state.urgent } : {})}
          />
          {trailing}
        </>
      );
      if (!row.onPress) {
        return (
          <Row
            gap="12"
            style={[styles.row, dim]}
            testID={row.testID}
            accessible
            accessibilityLabel={label}
            {...(row.kind === 'check'
              ? {
                  accessibilityRole: 'checkbox' as const,
                  accessibilityState: { checked: row.checked },
                }
              : {})}
          >
            {content}
          </Row>
        );
      }
      return (
        <PressScale
          onPress={row.onPress}
          disabled={row.disabled}
          widthClass="wide"
          accessibilityLabel={label}
          testID={`settings-row-${row.key}`}
          {...(row.kind === 'check'
            ? {
                accessibilityRole: 'checkbox' as const,
                accessibilityState: { checked: row.checked },
              }
            : {})}
          style={[styles.row, { flexDirection: 'row', gap: theme.space['12'] }, dim]}
          testID={row.testID}
        >
          {content}
        </PressScale>
      );
    }
  }
}

/** A titled settings section: value ›, toggle, check, private, destructive and custom rows. */
export function SettingsGroup({ title, rows, testID }: SettingsGroupProps) {
  const styles = useStyles();
  return (
    <Stack gap="8" testID={testID}>
      {title ? (
        <Text variant="eyebrow" accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={styles.group}>
        {rows.map((row, index) => (
          <Fragment key={row.key}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <SettingsRowView row={row} />
          </Fragment>
        ))}
      </View>
    </Stack>
  );
}
