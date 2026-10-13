/**
 * Share with your driver (6i-1) in the premium look (undesigned; built from the kit's sheet, rows
 * and buttons): a page with the days you pick, no login, first names only, no budgets and no chat.
 * Before a link exists the sheet asks who it is for; after, it shows the link with Copy and Send on
 * WhatsApp (the person sends it), the days, the expiry, the quote toggle, how often the driver
 * opened it and Revoke link (confirmed once).
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import {
  Banner,
  Button,
  Card,
  Checkbox,
  ListCard,
  Row,
  Text,
  TextButton,
  TextField,
  Toggle,
  usePremiumTheme,
} from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import type { DriverShareView } from '../share/share-types';
import { useDriverShare } from '../share/use-driver-share';

export function DriverSharePremium({ tripId }: { readonly tripId: string }) {
  const view = useDriverShare(tripId);
  return <DriverShareSheet view={view} />;
}

function DriverShareSheet({ view }: { readonly view: DriverShareView }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const name = view.driverName.trim();
  const chosen = view.days.filter((d) => d.selected);
  const daysValue =
    chosen.length === 0
      ? t({ id: 'drivers.share.noDays', message: 'Pick at least one day' })
      : chosen.map((d) => d.label).join(', ');
  const note =
    view.status === 'needs_signal'
      ? t({
          id: 'drivers.share.needsSignal',
          message: 'Making the link needs signal. Try again once you’re back online.',
        })
      : view.status === 'revoked'
        ? t({ id: 'drivers.share.revoked', message: 'The link is off. The page shows it at once.' })
        : view.status === 'copied'
          ? t({ id: 'drivers.share.copied', message: 'Link copied.' })
          : null;
  const quoteLabel =
    name === ''
      ? t({ id: 'drivers.share.quoteAnyone', message: 'Let them send a quote' })
      : t({ id: 'drivers.share.quote', message: `Let ${name} send a quote` });
  return (
    <SheetScreen
      title={
        name === ''
          ? t({ id: 'drivers.share.titleAnyone', message: 'Share with your driver' })
          : t({ id: 'drivers.share.title', message: `Share with ${name}` })
      }
      cancelLabel={t({ id: 'drivers.premium.cancel', message: 'Cancel' })}
      testID="driver-share-sheet"
    >
      <View style={[styles.body, { gap: th.space.gap12 }]}>
        <Text variant="rowText" tone="muted">
          {t({
            id: 'drivers.share.body',
            message:
              'A page with the days you pick. No login. First names only, no budgets, no chat.',
          })}
        </Text>
        {view.onDriverName === null ? null : (
          <TextField
            accessibilityLabel={t({
              id: 'drivers.share.nameLabel',
              message: 'Driver or guide’s first name',
            })}
            placeholder={t({
              id: 'drivers.share.nameLabel',
              message: 'Driver or guide’s first name',
            })}
            value={view.driverName}
            onChangeText={view.onDriverName}
            maxLength={40}
            testID="driver-share-name"
          />
        )}
        {view.url === null ? (
          <Button
            label={t({ id: 'drivers.share.create', message: 'Make the link' })}
            loading={view.status === 'creating'}
            disabled={name === '' || chosen.length === 0}
            onPress={view.onCreate}
            testID="driver-share-create"
          />
        ) : (
          <>
            <Card padded style={styles.link} testID="driver-share-link">
              <Text variant="rowTextStrong" style={styles.grow} numberOfLines={1}>
                {view.url.replace(/^https:\/\//u, '')}
              </Text>
              <Button
                label={t({ id: 'drivers.share.copy', message: 'Copy' })}
                size="small"
                variant="secondary"
                onPress={view.onCopy}
                testID="driver-share-copy"
              />
            </Card>
            <Button
              label={t({ id: 'drivers.share.whatsapp', message: 'Send on WhatsApp' })}
              onPress={view.onWhatsApp}
              testID="driver-share-whatsapp"
            />
          </>
        )}
        <ListCard testID="driver-share-settings">
          <Row title={t({ id: 'drivers.share.days', message: 'Days' })} trailingText={daysValue} />
          {view.days.map((day) => (
            <Row
              key={day.dayNo}
              title={day.label}
              trailing={
                <Checkbox
                  checked={day.selected}
                  onChange={() => view.onToggleDay(day.dayNo)}
                  accessibilityLabel={day.label}
                />
              }
              onPress={() => view.onToggleDay(day.dayNo)}
              testID={`driver-share-day-${day.dayNo}`}
            />
          ))}
          <Row
            title={t({ id: 'drivers.share.expires', message: 'Link expires' })}
            trailingText={view.expiresLabel}
            onPress={view.onCycleExpiry}
            testID="driver-share-expiry"
          />
          <Row
            title={quoteLabel}
            subtitle={t({
              id: 'drivers.share.quoteHint',
              message: 'They can also suggest changes and tips',
            })}
            trailing={
              <Toggle
                value={view.allowQuote}
                onChange={view.onAllowQuote}
                accessibilityLabel={quoteLabel}
                testID="driver-share-quote"
              />
            }
          />
          <Row title={t({ id: 'drivers.share.private', message: 'Budgets, chat, last names' })} />
        </ListCard>
        {view.url === null ? null : (
          <View style={styles.footer}>
            <Text variant="caption" tone="muted" style={styles.grow} testID="driver-share-opened">
              {view.opened ?? t({ id: 'drivers.share.notOpened', message: 'Not opened yet' })}
              {view.stale ? t({ id: 'drivers.share.lastKnown', message: ' · last known' }) : ''}
            </Text>
            <TextButton
              label={
                view.status === 'confirm_revoke'
                  ? t({ id: 'drivers.share.revokeConfirm', message: 'Tap again to revoke' })
                  : t({ id: 'drivers.share.revoke', message: 'Revoke link' })
              }
              color={th.color.destructive.text}
              onPress={view.onRevoke}
              testID="driver-share-revoke"
            />
          </View>
        )}
        {note === null ? null : (
          <Banner
            tone={view.status === 'needs_signal' ? 'error' : 'info'}
            text={note}
            testID={`driver-share-${view.status}`}
          />
        )}
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 4, paddingBottom: 24 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
