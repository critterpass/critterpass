/**
 * The issued pass when the seat could not be taken, in the invite's own problem card. A join that
 * never arrived (or was told to wait) is sent again from here with "Try again", with Home as the
 * way out; a join the crew or the invite refuses only leads Home.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { InlineAction } from '@/ui/buttons/InlineAction';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';

import { InviteProblem } from './InviteProblem';
import { canRetryJoin, problemCardOf, type JoinProblem } from './join';

const useStyles = makeStyles((th) => ({
  footer: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['8'],
    alignItems: 'center',
  },
}));

export interface PassJoinProblemProps {
  readonly problem: JoinProblem;
  readonly inviterFirstName: string | null;
  readonly crewName: string | null;
  readonly onRetry: () => void;
  readonly onHome: () => void;
}

export function PassJoinProblem(props: PassJoinProblemProps) {
  const styles = useStyles();
  const home = t({ id: 'onboarding.invite.pass.home', message: 'Go home' });
  const again = canRetryJoin(props.problem);
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="invite-pass-problem">
      <InviteProblem
        kind={problemCardOf(props.problem)}
        inviterFirstName={props.inviterFirstName}
        crewName={props.crewName}
        action={
          again
            ? {
                label: t({ id: 'onboarding.invite.problem.retry', message: 'Try again' }),
                onPress: props.onRetry,
              }
            : { label: home, onPress: props.onHome }
        }
      />
      {again ? (
        <View style={styles.footer}>
          <InlineAction label={home} onPress={props.onHome} testID="invite-pass-home" />
        </View>
      ) : null}
    </Scaffold>
  );
}
