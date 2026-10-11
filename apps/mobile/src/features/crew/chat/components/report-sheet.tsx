/**
 * Report a crewmate's message: pick a reason and it goes to the review team. Offers to mute the
 * sender at the same time.
 */
import { REPORT_REASONS, type ReportReason } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Sheet } from '@/ui/sheet/Sheet';
import { Stack, Text } from '@/ui';
import { makeStyles } from '@/ui/theme';

import { reasonLabel } from './report-reasons';

const useStyles = makeStyles((th) => ({ body: { padding: th.space['16'], gap: th.space['16'] } }));

export { reasonLabel } from './report-reasons';

export function ReportSheet({
  senderName,
  onReport,
  onClose,
}: {
  readonly senderName: string;
  readonly onReport: (reason: ReportReason, mute: boolean) => void;
  readonly onClose: () => void;
}) {
  const styles = useStyles();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [mute, setMute] = useState(false);
  return (
    <Sheet
      detents={['large']}
      onDismiss={onClose}
      accessibilityLabel={t({ id: 'chat.report.title', message: 'Report message' })}
      testID="chat-report"
    >
      <View style={styles.body}>
        <Stack gap="6">
          <Text variant="h2" accessibilityRole="header">
            {t({ id: 'chat.report.title', message: 'Report message' })}
          </Text>
          <Text variant="body">
            {t({
              id: 'chat.report.line',
              message: 'Our team reviews it. The sender is not told who reported it.',
            })}
          </Text>
        </Stack>
        <SettingsGroup
          rows={REPORT_REASONS.map((value) => ({
            key: value,
            kind: 'check' as const,
            title: reasonLabel(value),
            checked: reason === value,
            onPress: () => setReason(value),
          }))}
          testID="chat-report-reasons"
        />
        <SettingsGroup
          rows={[
            {
              key: 'mute',
              kind: 'toggle',
              title: t({ id: 'chat.report.alsoMute', message: `Also mute ${senderName}` }),
              value: mute,
              onChange: setMute,
            },
          ]}
        />
        <PillButton
          label={t({ id: 'chat.report.send', message: 'Send report' })}
          disabled={reason === null}
          onPress={() => {
            if (reason !== null) onReport(reason, mute);
          }}
          block
          testID="chat-report-send"
        />
      </View>
    </Sheet>
  );
}
