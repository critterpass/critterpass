import { t } from '@lingui/core/macro';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { I18nManager, View } from 'react-native';

import { SecondaryText } from '../cards/SecondaryText';
import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';
import { Toggle } from './Toggle';

interface RowBase {
  readonly key: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly disabled?: boolean;
}

export type SettingsRow =
  | (RowBase & { readonly kind: 'value'; readonly value: string; readonly onPress: () => void })
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
}));

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
  const chevron = I18nManager.isRTL ? '‹' : '›';
  const dim = row.disabled ? { opacity: 0.4 } : null;
  const described = (extra?: string) => [row.title, row.subtitle, extra].filter(Boolean).join(', ');
  switch (row.kind) {
    case 'toggle':
      return (
        <Row gap="12" style={[styles.row, dim]}>
          <Titles title={row.title} {...(row.subtitle ? { subtitle: row.subtitle } : {})} />
          <Toggle
            value={row.value}
            onValueChange={row.onChange}
            label={described()}
            {...(row.disabled ? { disabled: true } : {})}
          />
        </Row>
      );
    case 'custom':
      return (
        <Row gap="12" style={[styles.row, dim]}>
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
        row.kind === 'value' ? (
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
          {...(row.kind === 'check'
            ? {
                accessibilityRole: 'checkbox' as const,
                accessibilityState: { checked: row.checked },
              }
            : {})}
          style={[styles.row, { flexDirection: 'row', gap: theme.space['12'] }, dim]}
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
