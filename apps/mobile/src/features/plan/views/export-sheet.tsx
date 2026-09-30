/**
 * The plan's export sheet (undesigned; built from the sheet, pills and the raised note): "Add to
 * my calendar" writes my items to the phone's calendar when this build can (write-only access),
 * "Subscribe" opens the plan's live feed in the calendar app, "Copy the link" copies it, and
 * "Turn the link off" revokes every live feed of mine on the trip. Without the native writer the
 * sheet leads with Subscribe.
 */
/* eslint-disable lingui/no-unlocalized-strings -- status values and toast ids, never copy. */
import { plural, t } from '@lingui/core/macro';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useContext, useState } from 'react';
import { View } from 'react-native';

import type { CalendarFeedIssued } from '@cp/domain';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { toast } from '@/motion/island-toast';
import { TextLink } from '@/ui/buttons/TextLink';
import { PillButton } from '@/ui/buttons/PillButton';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import {
  CREATE_CALENDAR_FEED,
  REVOKE_CALENDAR_FEED,
  feedUrls,
  type CalendarWriter,
  type DeviceCalendarEvent,
} from './data/calendar-export';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingBottom: th.space['24'], gap: th.space['12'] },
  note: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
  },
}));

export type ExportStatus =
  'idle' | 'writing' | 'written' | 'denied' | 'subscribing' | 'needs_signal' | 'revoked';

export interface ExportSheetViewProps {
  readonly canWrite: boolean;
  readonly eventCount: number;
  readonly status: ExportStatus;
  readonly written: number;
  readonly onWrite: () => void;
  readonly onSubscribe: () => void;
  readonly onCopy: () => void;
  readonly onRevoke: () => void;
  readonly onClose: () => void;
}

function statusText(status: ExportStatus, written: number): string | null {
  switch (status) {
    case 'written':
      return t({
        id: 'plan.export.written',
        message: plural(written, {
          one: 'Added # plan to your calendar.',
          other: 'Added # plans to your calendar.',
        }),
      });
    case 'denied':
      return t({
        id: 'plan.export.denied',
        message:
          'CritterPass can’t add to your calendar. Allow it in Settings, or subscribe instead.',
      });
    case 'needs_signal':
      return t({
        id: 'plan.export.needsSignal',
        message: 'Making the link needs signal. Try again once you’re back online.',
      });
    case 'revoked':
      return t({
        id: 'plan.export.revoked',
        message: 'The link is off. Calendars subscribed to it stop updating.',
      });
    case 'idle':
    case 'writing':
    case 'subscribing':
      return null;
  }
}

export function ExportSheetView(props: ExportSheetViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const note = statusText(props.status, props.written);
  const count = props.eventCount;
  const subscribe = (
    <PillButton
      label={t({ id: 'plan.export.subscribe', message: 'Subscribe in my calendar' })}
      variant={props.canWrite ? 'secondary' : 'primary'}
      block
      loading={props.status === 'subscribing'}
      onPress={props.onSubscribe}
      testID="plan-export-subscribe"
    />
  );
  return (
    <Sheet
      detents={['fit']}
      title={t({ id: 'plan.export.title', message: 'Put the plan in your calendar' })}
      onDismiss={props.onClose}
      testID="plan-export"
    >
      <View style={styles.body}>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {props.canWrite
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
              })}
        </Text>
        {props.canWrite ? (
          <PillButton
            label={t({ id: 'plan.export.write', message: 'Add to my calendar' })}
            block
            loading={props.status === 'writing'}
            disabled={count === 0}
            onPress={props.onWrite}
            testID="plan-export-write"
          />
        ) : null}
        {subscribe}
        <TextLink
          label={t({ id: 'plan.export.copy', message: 'Copy the link' })}
          onPress={props.onCopy}
          testID="plan-export-copy"
        />
        <TextLink
          label={t({ id: 'plan.export.revoke', message: 'Turn the link off' })}
          onPress={props.onRevoke}
          testID="plan-export-revoke"
        />
        {note === null ? null : (
          <View style={styles.note} testID={`plan-export-${props.status}`}>
            <Text variant="bodySm">{note}</Text>
          </View>
        )}
      </View>
    </Sheet>
  );
}

/** The sheet wired to the command client, the native writer and the calendar app. */
export function ExportSheet({
  tripId,
  events,
  writer,
  onClose,
}: {
  readonly tripId: string;
  readonly events: readonly DeviceCalendarEvent[];
  readonly writer: CalendarWriter | null;
  readonly onClose: () => void;
}) {
  const commands = useContext(LocalFirstContext)?.commands ?? null;
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [written, setWritten] = useState(0);

  const issue = async (): Promise<ReturnType<typeof feedUrls> | null> => {
    const sent = await commands?.send(CREATE_CALENDAR_FEED, { trip_id: tripId });
    if (sent?.kind !== 'applied') {
      setStatus('needs_signal');
      return null;
    }
    return feedUrls(sent.result as CalendarFeedIssued);
  };

  return (
    <ExportSheetView
      canWrite={writer !== null}
      eventCount={events.length}
      status={status}
      written={written}
      onWrite={() => {
        if (writer === null) return;
        setStatus('writing');
        void (async () => {
          const allowed = await writer.requestWriteAccess().catch(() => false);
          if (!allowed) {
            setStatus('denied');
            return;
          }
          const count = await writer.writeEvents(events).catch(() => -1);
          if (count < 0) {
            setStatus('denied');
            return;
          }
          setWritten(count);
          setStatus('written');
        })();
      }}
      onSubscribe={() => {
        setStatus('subscribing');
        void issue().then(async (urls) => {
          if (urls === null) return;
          setStatus('idle');
          await Linking.openURL(urls.webcal).catch(() => Clipboard.setStringAsync(urls.https));
        });
      }}
      onCopy={() => {
        void issue().then(async (urls) => {
          if (urls === null) return;
          await Clipboard.setStringAsync(urls.https);
          toast.show({
            id: 'plan-export-copied',
            title: t({ id: 'plan.export.copied', message: 'Link copied' }),
          });
        });
      }}
      onRevoke={() => {
        void commands?.send(REVOKE_CALENDAR_FEED, { trip_id: tripId }).then((sent) => {
          setStatus(sent.kind === 'applied' ? 'revoked' : 'needs_signal');
        });
      }}
      onClose={onClose}
    />
  );
}
