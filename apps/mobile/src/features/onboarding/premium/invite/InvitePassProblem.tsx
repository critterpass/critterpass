/**
 * The issued pass when the seat could not be taken, on the kit's empty state like every other
 * invite problem. A join that never arrived (or was told to wait) is sent again with "Try again",
 * with "Go home" under it; a join the crew or the invite refuses only leads home. ✕ gives the seat
 * up too: the pass is theirs either way.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Button, EmptyState, TextButton, usePremiumTheme } from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { inviteProblemCopy } from '../../invited/invite-problem-copy';
import { canRetryJoin, problemCardOf, type JoinProblem } from '../../invited/join';

export interface InvitePassProblemProps {
  readonly problem: JoinProblem;
  readonly inviterFirstName: string | null;
  readonly crewName: string | null;
  readonly onRetry: () => void;
  readonly onHome: () => void;
}

export function InvitePassProblem({
  problem,
  inviterFirstName,
  crewName,
  onRetry,
  onHome,
}: InvitePassProblemProps) {
  const theme = usePremiumTheme();
  const copy = inviteProblemCopy(problemCardOf(problem), inviterFirstName, crewName);
  const home = t({ id: 'onboarding.invite.pass.home', message: 'Go home' });
  const again = canRetryJoin(problem);
  return (
    <FullScreen
      closeLabel={t({ id: 'common.sheet.close', message: 'Close' })}
      overPhoto={false}
      onClose={onHome}
      testID="invite-pass-problem"
    >
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.ground,
          justifyContent: 'center',
          paddingHorizontal: theme.space.titleGutter,
          gap: theme.space.gap12,
        }}
      >
        <EmptyState
          title={copy.title}
          line={copy.line}
          check={false}
          action={
            <Button
              label={
                again ? t({ id: 'onboarding.invite.problem.retry', message: 'Try again' }) : home
              }
              onPress={again ? onRetry : onHome}
              size="medium"
            />
          }
        />
        {again ? (
          <TextButton label={home} onPress={onHome} align="center" testID="invite-pass-home" />
        ) : null}
      </View>
    </FullScreen>
  );
}
