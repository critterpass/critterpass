/** Send feedback (3p-2) in the current look, with the leave-without-sending sheet. */
import { useLingui } from '@lingui/react/macro';

import { ConfirmSheet } from '@/ui/states/ConfirmSheet';

import { FeedbackView } from './FeedbackView';
import { useFeedbackForm } from './use-feedback-form';

export function FeedbackScreen() {
  const { t } = useLingui();
  const { leaving, stay, leave, ...view } = useFeedbackForm();
  return (
    <>
      <FeedbackView {...view} />
      {leaving ? (
        <ConfirmSheet
          title={t({ id: 'help.feedback.discardTitle', message: 'Leave without sending?' })}
          consequences={[
            t({
              id: 'help.feedback.discardLine',
              message: 'Your note and its photos are dropped.',
            }),
          ]}
          confirmLabel={t({ id: 'help.feedback.discard', message: 'Leave' })}
          mode="button"
          onConfirm={leave}
          onCancel={stay}
          testID="help-feedback-discard"
        />
      ) : null}
    </>
  );
}
