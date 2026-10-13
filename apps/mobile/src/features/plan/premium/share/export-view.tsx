/**
 * Putting the plan in a calendar, in the premium look (undesigned; built from the in-page sheet,
 * buttons and text buttons): add my stops once when this build can write, subscribe so the
 * calendar follows the crew's changes, copy the link or turn it off, and a note on what happened.
 */
import { plural, t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { Button, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import { exportStatusText, type ExportSheetViewProps } from '../../views/export-sheet';
import { OverlaySheet } from '../sheets/overlay-sheet';

export function PremiumExportView(props: ExportSheetViewProps) {
  const theme = usePremiumTheme();
  const note = exportStatusText(props.status, props.written);
  const count = props.eventCount;
  return (
    <OverlaySheet
      title={t({ id: 'plan.export.title', message: 'Put the plan in your calendar' })}
      line={
        props.canWrite
          ? t({
              id: 'plan.export.bodyWrite',
              message: plural(count, {
                one: 'Add your # plan once, or subscribe so your calendar follows every change the crew makes.',
                other:
                  'Add your # plans once, or subscribe so your calendar follows every change the crew makes.',
              }),
            })
          : t({
              id: 'plan.export.bodySubscribe',
              message:
                'Subscribe and your calendar follows every change the crew makes, just for your plans.',
            })
      }
      closeLabel={t({ id: 'plan.premium.share.close', message: 'Close' })}
      onDismiss={props.onClose}
      testID="plan-export"
    >
      <View style={styles.body}>
        {props.canWrite ? (
          <Button
            label={t({ id: 'plan.export.write', message: 'Add to my calendar' })}
            loading={props.status === 'writing'}
            disabled={count === 0}
            onPress={props.onWrite}
            testID="plan-export-write"
          />
        ) : null}
        <Button
          label={t({ id: 'plan.export.subscribe', message: 'Subscribe in my calendar' })}
          variant={props.canWrite ? 'secondary' : 'primary'}
          loading={props.status === 'subscribing'}
          onPress={props.onSubscribe}
          testID="plan-export-subscribe"
        />
        <View style={styles.links}>
          <TextButton
            label={t({ id: 'plan.export.copy', message: 'Copy the link' })}
            onPress={props.onCopy}
            testID="plan-export-copy"
          />
          <TextButton
            label={t({ id: 'plan.export.revoke', message: 'Turn the link off' })}
            tone="muted"
            onPress={props.onRevoke}
            testID="plan-export-revoke"
          />
        </View>
        {note === null ? null : (
          <View
            style={[styles.note, { backgroundColor: theme.color.controlSheet }]}
            testID={`plan-export-${props.status}`}
          >
            <Text variant="rowText">{note}</Text>
          </View>
        )}
      </View>
    </OverlaySheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
  links: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  note: { borderRadius: 16, padding: 14 },
});
