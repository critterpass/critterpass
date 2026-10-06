/**
 * Share with your driver (6i-1): a page with the days you pick, no login, first names only, no
 * budgets and no chat. Before a link exists the sheet asks who it is for; after, it shows the link
 * with COPY, SEND ON WHATSAPP (the person sends it), the days, the expiry, the quote toggle, how
 * often the driver opened it and REVOKE LINK (confirmed once).
 */
/* eslint-disable lingui/no-unlocalized-strings -- status values and test ids, never copy. */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { TextField } from '@/ui/inputs/TextField';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export type DriverShareStatus =
  'idle' | 'creating' | 'needs_signal' | 'confirm_revoke' | 'revoked' | 'copied';

export interface DriverShareDay {
  readonly dayNo: number;
  readonly label: string;
  readonly selected: boolean;
}

export interface DriverShareSheetViewProps {
  readonly driverName: string;
  readonly onDriverName: ((name: string) => void) | null;
  readonly url: string | null;
  readonly days: readonly DriverShareDay[];
  readonly onToggleDay: (dayNo: number) => void;
  readonly expiresLabel: string;
  readonly onCycleExpiry: () => void;
  readonly allowQuote: boolean;
  readonly onAllowQuote: (next: boolean) => void;
  /** "Opened twice · last at 10:14 today"; null before the first open. */
  readonly opened: string | null;
  /** True when the open count shown is the last one known (no signal). */
  readonly stale: boolean;
  readonly status: DriverShareStatus;
  readonly onCreate: () => void;
  readonly onCopy: () => void;
  readonly onWhatsApp: () => void;
  readonly onRevoke: () => void;
  readonly onClose: () => void;
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingBottom: th.space['24'], gap: th.space['12'] },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['8'],
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
  },
  linkText: { flex: 1 },
  row: { flexDirection: 'row', gap: th.space['8'] },
  grow: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  note: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
  },
}));

export function DriverShareSheetView(props: DriverShareSheetViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const name = props.driverName.trim();
  const chosen = props.days.filter((d) => d.selected);
  const daysValue =
    chosen.length === 0
      ? t({ id: 'drivers.share.noDays', message: 'Pick at least one day' })
      : chosen.map((d) => d.label).join(', ');
  const note =
    props.status === 'needs_signal'
      ? t({
          id: 'drivers.share.needsSignal',
          message: 'Making the link needs signal. Try again once you’re back online.',
        })
      : props.status === 'revoked'
        ? t({ id: 'drivers.share.revoked', message: 'The link is off. The page shows it at once.' })
        : props.status === 'copied'
          ? t({ id: 'drivers.share.copied', message: 'Link copied.' })
          : null;
  return (
    <Sheet
      detents={['fit']}
      title={
        name === ''
          ? t({ id: 'drivers.share.titleAnyone', message: 'Share with your driver' })
          : t({ id: 'drivers.share.title', message: `Share with ${name}` })
      }
      onDismiss={props.onClose}
      testID="driver-share-sheet"
    >
      <View style={styles.body}>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'drivers.share.body',
            message:
              'A page with the days you pick. No login. First names only, no budgets, no chat.',
          })}
        </Text>
        {props.onDriverName && (
          <TextField
            label={t({ id: 'drivers.share.nameLabel', message: 'Driver or guide’s first name' })}
            value={props.driverName}
            onChangeText={props.onDriverName}
            maxLength={40}
            testID="driver-share-name"
          />
        )}
        {props.url === null ? (
          <PillButton
            label={t({ id: 'drivers.share.create', message: 'Make the link' })}
            block
            loading={props.status === 'creating'}
            disabled={name === '' || chosen.length === 0}
            onPress={props.onCreate}
            testID="driver-share-create"
          />
        ) : (
          <>
            <View style={styles.link} testID="driver-share-link">
              <Text variant="monoData" style={styles.linkText} numberOfLines={1}>
                {props.url.replace(/^https:\/\//u, '')}
              </Text>
              <PillButton
                label={t({ id: 'drivers.share.copy', message: 'Copy' })}
                size="sm"
                variant="secondary"
                onPress={props.onCopy}
                testID="driver-share-copy"
              />
            </View>
            <PillButton
              label={t({ id: 'drivers.share.whatsapp', message: 'Send on WhatsApp' })}
              block
              onPress={props.onWhatsApp}
              testID="driver-share-whatsapp"
            />
          </>
        )}
        <SettingsGroup
          rows={[
            {
              key: 'days',
              kind: 'custom',
              title: t({ id: 'drivers.share.days', message: 'Days' }),
              trailing: (
                <Text variant="bodySm" numberOfLines={2}>
                  {daysValue}
                </Text>
              ),
            },
            ...props.days.map((day) => ({
              key: `day-${day.dayNo}`,
              kind: 'check' as const,
              title: day.label,
              checked: day.selected,
              onPress: () => props.onToggleDay(day.dayNo),
            })),
            {
              key: 'expiry',
              kind: 'value',
              title: t({ id: 'drivers.share.expires', message: 'Link expires' }),
              value: props.expiresLabel,
              onPress: props.onCycleExpiry,
            },
            {
              key: 'quote',
              kind: 'toggle',
              title:
                name === ''
                  ? t({ id: 'drivers.share.quoteAnyone', message: 'Let them send a quote' })
                  : t({ id: 'drivers.share.quote', message: `Let ${name} send a quote` }),
              subtitle: t({
                id: 'drivers.share.quoteHint',
                message: 'They can also suggest changes and tips',
              }),
              value: props.allowQuote,
              onChange: props.onAllowQuote,
            },
            {
              key: 'private',
              kind: 'private',
              title: t({ id: 'drivers.share.private', message: 'Budgets, chat, last names' }),
            },
          ]}
          testID="driver-share-settings"
        />
        {props.url !== null && (
          <View style={styles.footer}>
            <Text
              variant="bodySm"
              color={theme.semantic.text.secondary}
              testID="driver-share-opened"
            >
              {props.opened ?? t({ id: 'drivers.share.notOpened', message: 'Not opened yet' })}
              {props.stale ? t({ id: 'drivers.share.lastKnown', message: ' · last known' }) : ''}
            </Text>
            <TextLink
              label={
                props.status === 'confirm_revoke'
                  ? t({ id: 'drivers.share.revokeConfirm', message: 'Tap again to revoke' })
                  : t({ id: 'drivers.share.revoke', message: 'Revoke link' })
              }
              onPress={props.onRevoke}
              testID="driver-share-revoke"
            />
          </View>
        )}
        {note !== null && (
          <View style={styles.note} testID={`driver-share-${props.status}`}>
            <Text variant="bodySm">{note}</Text>
          </View>
        )}
      </View>
    </Sheet>
  );
}
