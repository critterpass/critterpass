/**
 * "Report a problem" under a place's AI summary: files `report_content` (kind `place_profile`,
 * reason `inaccurate`), which puts the summary in the ops queue and has it written again from fresh
 * pages. Once sent (or queued offline) the link gives way to a short thanks; a refused report keeps
 * the link with a line saying it did not go.
 */
import { useLingui } from '@lingui/react/macro';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { TextLink } from '@/ui/buttons/TextLink';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { reportContentCommand } from './commands';

type ReportState = 'idle' | 'sent' | 'failed';

export function ReportProfile({ poiId }: { readonly poiId: string }) {
  const theme = useTheme();
  const { t } = useLingui();
  const { send, pending } = useCommand(reportContentCommand);
  const [state, setState] = useState<ReportState>('idle');
  const report = useCallback(() => {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- wire values, never copy.
    void send({ kind: 'place_profile', id: poiId, reason: 'inaccurate' }).then((result) =>
      setState(result.kind === 'queued' || result.kind === 'applied' ? 'sent' : 'failed'),
    );
  }, [poiId, send]);

  if (state === 'sent') {
    return (
      <Text
        variant="bodySm"
        color={theme.semantic.text.secondary}
        singleLine={false}
        testID="place-detail-profile-reported"
      >
        {t({
          id: 'explore.profile.reported',
          message: 'Thanks. We’ll check this summary and write it again.',
        })}
      </Text>
    );
  }
  return (
    <View style={{ gap: theme.space['4'], alignItems: 'flex-start' }}>
      <TextLink
        label={t({ id: 'explore.profile.report', message: 'Report a problem' })}
        onPress={report}
        disabled={pending}
        testID="place-detail-profile-report"
      />
      {state === 'failed' ? (
        <Text
          variant="bodySm"
          color={theme.semantic.text.secondary}
          singleLine={false}
          testID="place-detail-profile-report-failed"
        >
          {t({
            id: 'explore.profile.reportFailed',
            message: 'That didn’t go through. Try again in a while.',
          })}
        </Text>
      ) : null}
    </View>
  );
}
