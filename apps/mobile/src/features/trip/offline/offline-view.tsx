/**
 * The offline state (3k-4) from props: the night card, STILL WORKS, SENDS WHEN YOU'RE BACK, what
 * didn't go through, OPEN TODAY'S PLAN and when this phone last synced. The hub shows it in place
 * of its header while offline; `/hub/{trip}/offline` shows it on its own.
 */
import type { RejectedCommand } from '@/data/status/use-rejected-commands';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import { PillButton } from '@/ui/buttons/PillButton';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { ConflictsList } from './conflicts-list';
import { OfflineCard, type OfflineCardProps } from './offline-card';
import { SendsList, type SendsLine } from './sends-list';
import { StillWorksList, type StillWorksLine } from './still-works-list';

export interface OfflineViewProps {
  readonly card: OfflineCardProps;
  readonly stillWorks: readonly StillWorksLine[];
  readonly sends: readonly SendsLine[];
  readonly conflicts: readonly RejectedCommand[];
  /** "Last synced 03:02"; null before the first sync. */
  readonly lastSynced: string | null;
  readonly onOpenPlan: (() => void) | null;
  readonly onOpenSend: (opId: string) => void;
  readonly onDismissConflict: (opId: string) => void;
  readonly sheet?: ReactNode;
}

export function OfflineView(props: OfflineViewProps) {
  const theme = useTheme();
  const { t } = useLingui();
  const { lastSynced } = props;
  return (
    <Stack gap="12" testID="trip-offline">
      <OfflineCard {...props.card} />
      {props.card.chip === 'weak' ? (
        <Text variant="bodySm" color={theme.color.orange} testID="trip-offline-weak">
          {t({ id: 'trip.offline.weakLine', message: 'Signal is weak. Sending slowly.' })}
        </Text>
      ) : null}
      {props.stillWorks.length === 0 ? null : <StillWorksList lines={props.stillWorks} />}
      <SendsList lines={props.sends} onOpen={props.onOpenSend} />
      <ConflictsList items={props.conflicts} onDismiss={props.onDismissConflict} />
      {props.onOpenPlan === null ? null : (
        <PillButton
          label={t({ id: 'trip.offline.openPlan', message: "Open today's plan" })}
          tone="yellow"
          block
          onPress={props.onOpenPlan}
          testID="trip-offline-open-plan"
        />
      )}
      {lastSynced === null ? null : (
        <Text
          variant="bodySm"
          color={theme.semantic.text.secondary}
          style={{ textAlign: 'center' }}
        >
          {t({ id: 'trip.offline.lastSynced', message: `Last synced ${lastSynced}` })}
        </Text>
      )}
      {props.sheet}
    </Stack>
  );
}
