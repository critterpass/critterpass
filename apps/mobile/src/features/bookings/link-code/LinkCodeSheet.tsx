/**
 * "Got a code? Link your email" (undesigned, logged in docs/undesigned-states.md): a sheet with
 * what the code is for, the six code boxes and LINK. A wrong or expired code, too many tries or no
 * signal shows under the boxes; once linked the sheet says what happens next and DONE closes it,
 * while the held mail's bookings arrive on the add screen behind it.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { CodeBoxes } from '@/ui/inputs/CodeBoxes';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { LINK_CODE_LENGTH, type LinkCodeState } from './link-code-model';

const useStyles = makeStyles((t) => ({
  body: { padding: t.space['16'], gap: t.space['12'] },
}));

export interface LinkCodeSheetProps {
  readonly state: LinkCodeState;
  readonly onLink: (code: string) => void;
  readonly onClose: () => void;
  /** The code the boxes open with (lab scenes). */
  readonly initialCode?: string;
}

function useProblem(state: LinkCodeState): string | null {
  const { t } = useLingui();
  switch (state.kind) {
    case 'wrong':
      return t({
        id: 'bookings.linkCode.wrong',
        message:
          'That code doesn’t match, or it has expired. Codes last a day; use the newest one.',
      });
    case 'wait': {
      const minutes = state.minutes;
      return t({
        id: 'bookings.linkCode.wait',
        message: `Too many tries. Try again in ${minutes} min.`,
      });
    }
    case 'offline':
      return t({ id: 'bookings.linkCode.offline', message: 'Linking needs signal. Try again.' });
    case 'failed':
      return t({ id: 'bookings.linkCode.failed', message: "That didn't go through. Try again." });
    case 'idle':
    case 'sending':
    case 'linked':
      return null;
  }
}

export function LinkCodeSheet(props: LinkCodeSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const [code, setCode] = useState(props.initialCode ?? '');
  const problem = useProblem(props.state);
  const title = t({ id: 'bookings.linkCode.title', message: 'Link your email' });
  const linked = props.state.kind === 'linked';
  return (
    <Sheet
      detents={['fit']}
      title={title}
      onDismiss={props.onClose}
      accessibilityLabel={title}
      testID="bookings-link-code"
    >
      <View style={styles.body}>
        {linked ? (
          <Text variant="body" testID="bookings-link-code-linked">
            {props.state.kind === 'linked' && props.state.released > 0
              ? t({
                  id: 'bookings.linkCode.linked',
                  message: 'Linked. The mail we were holding is being read now.',
                })
              : t({
                  id: 'bookings.linkCode.linkedNothingHeld',
                  message: 'Linked. Mail you forward from that address is read from now on.',
                })}
          </Text>
        ) : (
          <>
            <Text variant="body" color={theme.semantic.text.secondary}>
              {t({
                id: 'bookings.linkCode.line',
                message:
                  'Forwarded from an address we don’t know yet? We emailed it a 6-digit code. Enter it to link that address and read the mail.',
              })}
            </Text>
            <CodeBoxes
              value={code}
              onChangeText={setCode}
              status={props.state.kind === 'wrong' ? 'invalid' : 'idle'}
              label={t({ id: 'bookings.linkCode.label', message: 'Link code' })}
              autoFocus
              testID="bookings-link-code-boxes"
            />
            {problem === null ? null : (
              <Text
                variant="bodySm"
                color={theme.semantic.state.urgent}
                testID="bookings-link-code-error"
              >
                {problem}
              </Text>
            )}
          </>
        )}
        <Stack>
          {linked ? (
            <PillButton
              label={t({ id: 'bookings.linkCode.done', message: 'Done' })}
              onPress={props.onClose}
              testID="bookings-link-code-done"
            />
          ) : (
            <PillButton
              label={t({ id: 'bookings.linkCode.link', message: 'Link' })}
              onPress={() => props.onLink(code)}
              disabled={code.length !== LINK_CODE_LENGTH}
              loading={props.state.kind === 'sending'}
              testID="bookings-link-code-send"
            />
          )}
        </Stack>
      </View>
    </Sheet>
  );
}
