/**
 * "Got a code? Link your email" (undesigned, logged in docs/undesigned-states.md) as a native form
 * sheet: Cancel and "Link", what the code is for, six code tiles and the problem under them (a
 * wrong or expired code, too many tries, no signal). Once linked the line says what happens next
 * and "Done" closes it, while the held mail's bookings arrive on the page behind it.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { useLinkCode } from '../add/use-link-code';
import { useWalletContext } from '../data/use-wallet-context';
import { LINK_CODE_LENGTH, type LinkCodeState } from '../link-code/link-code-model';
import { CodeTiles } from './components/CodeTiles';

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

export function LinkCodeSheetPremium() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const context = useWalletContext();
  const linkCode = useLinkCode(context.crewId);
  const [code, setCode] = useState('');
  const problem = useProblem(linkCode.state);
  const linked = linkCode.state.kind === 'linked';
  return (
    <SheetScreen
      title={t({ id: 'bookings.linkCode.title', message: 'Link your email' })}
      cancelLabel={t({ id: 'common.confirm.cancel', message: 'Cancel' })}
      verb={
        linked
          ? {
              label: t({ id: 'bookings.linkCode.done', message: 'Done' }),
              onPress: () => true,
              testID: 'bookings-link-code-done',
            }
          : {
              label: t({ id: 'bookings.linkCode.link', message: 'Link' }),
              disabled: code.length !== LINK_CODE_LENGTH || linkCode.state.kind === 'sending',
              // The sheet stays up for the answer: linked, or what went wrong.
              onPress: () => {
                linkCode.link(code);
                return false;
              },
              testID: 'bookings-link-code-send',
            }
      }
      testID="bookings-link-code"
    >
      <View style={{ gap: th.space.gap14, paddingTop: th.space.gap8 }}>
        {linked ? (
          <Text variant="body" testID="bookings-link-code-linked">
            {linkCode.state.kind === 'linked' && linkCode.state.released > 0
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
            <Text variant="note" tone="inkSecondary">
              {t({
                id: 'bookings.linkCode.line',
                message:
                  'Forwarded from an address we don’t know yet? We emailed it a 6-digit code. Enter it to link that address and read the mail.',
              })}
            </Text>
            <CodeTiles
              value={code}
              length={LINK_CODE_LENGTH}
              onChange={setCode}
              invalid={linkCode.state.kind === 'wrong'}
              accessibilityLabel={t({ id: 'bookings.linkCode.label', message: 'Link code' })}
              testID="bookings-link-code-boxes"
            />
            {problem === null ? null : (
              <Text
                variant="helper"
                color={th.color.destructive.helper}
                testID="bookings-link-code-error"
              >
                {problem}
              </Text>
            )}
          </>
        )}
      </View>
    </SheetScreen>
  );
}
